"""
Authentication routes
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends

from auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_user, require_admin
)
from models.schemas import (
    User, UserCreate, LoginRequest, LoginResponse,
    ChangePasswordRequest, ResetPasswordRequest, ConfirmResetPasswordRequest,
    UpdateProfileRequest, UserRole
)
from utils.database import db, get_logger
from utils.config import INITIAL_USERS, DEFAULT_PASSWORD
from services.email_service import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = get_logger(__name__)


@router.post("/seed-users")
async def seed_users(force_recreate: bool = False):
    """Criar usuários iniciais do sistema"""
    created_count = 0
    
    if force_recreate:
        await db.users.delete_many({})
    
    for user_data in INITIAL_USERS:
        existing = await db.users.find_one({"email": user_data["email"]}, {"_id": 0})
        if existing and not force_recreate:
            continue
        
        if existing and force_recreate:
            await db.users.delete_one({"email": user_data["email"]})
        
        reset_token = str(uuid.uuid4())
        reset_expires = datetime.now(timezone.utc) + timedelta(hours=24)
        
        user = User(
            email=user_data["email"],
            hashed_password=get_password_hash(DEFAULT_PASSWORD),
            role=UserRole(user_data["role"]),
            owner_name=user_data["owner_name"],
            needs_password_change=False,
            reset_token=reset_token,
            reset_token_expires=reset_expires
        )
        
        doc = user.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        if doc['reset_token_expires']:
            doc['reset_token_expires'] = doc['reset_token_expires'].isoformat()
        
        await db.users.insert_one(doc)
        
        if os.environ.get('RESEND_API_KEY'):
            await send_password_reset_email(user.email, reset_token)
        
        created_count += 1
    
    return {"message": f"{created_count} usuários criados com senha padrão: {DEFAULT_PASSWORD}"}


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Login de usuário"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user or not verify_password(request.password, user['hashed_password']):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    
    access_token = create_access_token(
        data={
            "sub": user['email'],
            "role": user['role'],
            "owner_name": user.get('owner_name'),
            "user_id": user['id']
        }
    )
    
    return LoginResponse(
        access_token=access_token,
        user={
            "email": user['email'],
            "role": user['role'],
            "owner_name": user.get('owner_name'),
            "needs_password_change": user.get('needs_password_change', False)
        }
    )


@router.post("/change-password")
async def change_password(request: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """Trocar senha do usuário logado"""
    user = await db.users.find_one({"email": current_user['sub']}, {"_id": 0})
    
    if not user or not verify_password(request.current_password, user['hashed_password']):
        raise HTTPException(status_code=401, detail="Senha atual incorreta")
    
    new_hashed = get_password_hash(request.new_password)
    await db.users.update_one(
        {"email": current_user['sub']},
        {"$set": {
            "hashed_password": new_hashed,
            "needs_password_change": False,
            "reset_token": None,
            "reset_token_expires": None
        }}
    )
    
    return {"message": "Senha alterada com sucesso"}


@router.patch("/profile")
async def update_profile(request: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    """Atualizar perfil do usuário logado"""
    await db.users.update_one(
        {"email": current_user['sub']},
        {"$set": {"owner_name": request.owner_name}}
    )
    
    return {"message": "Perfil atualizado com sucesso", "owner_name": request.owner_name}


@router.get("/me")
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Obter dados do usuário logado"""
    user = await db.users.find_one({"email": current_user['sub']}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return user


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Solicitar reset de senha"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user:
        return {"message": "Se o email existir, você receberá instruções"}
    
    reset_token = str(uuid.uuid4())
    reset_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    
    await db.users.update_one(
        {"email": request.email},
        {"$set": {
            "reset_token": reset_token,
            "reset_token_expires": reset_expires.isoformat()
        }}
    )
    
    await send_password_reset_email(request.email, reset_token)
    
    return {"message": "Se o email existir, você receberá instruções"}


@router.post("/confirm-reset-password")
async def confirm_reset_password(request: ConfirmResetPasswordRequest):
    """Confirmar reset de senha com token"""
    user = await db.users.find_one({"reset_token": request.token}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido")
    
    if user.get('reset_token_expires'):
        expires = datetime.fromisoformat(user['reset_token_expires'])
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="Token expirado")
    
    new_hashed = get_password_hash(request.new_password)
    await db.users.update_one(
        {"reset_token": request.token},
        {"$set": {
            "hashed_password": new_hashed,
            "needs_password_change": False,
            "reset_token": None,
            "reset_token_expires": None
        }}
    )
    
    return {"message": "Senha alterada com sucesso"}
