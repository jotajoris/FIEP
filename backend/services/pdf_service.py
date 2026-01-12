"""
PDF extraction service for Purchase Orders
"""
import fitz  # PyMuPDF
import re
import uuid
from fastapi import HTTPException


def extract_oc_from_pdf(pdf_bytes: bytes) -> dict:
    """Extrair dados de OC de um PDF"""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        
        for page in doc:
            full_text += page.get_text()
        
        doc.close()
        
        # Extrair número da OC
        oc_patterns = [
            r'OC[- ]?(\d+[\.\d]+)',
            r'Ordem de Compra[:\s]+(\d+[\.\d]+)',
            r'N[úu]mero[:\s]+(\d+[\.\d]+)'
        ]
        
        numero_oc = None
        for pattern in oc_patterns:
            oc_match = re.search(pattern, full_text, re.IGNORECASE)
            if oc_match:
                numero_oc = f"OC-{oc_match.group(1)}"
                break
        
        if not numero_oc:
            numero_oc = "OC-" + str(uuid.uuid4())[:8]
        
        # Extrair endereço de entrega
        endereco_patterns = [
            r'Endere[çc]o de Entrega[:\s]*(.*?)(?:\n\n|Linha|Item)',
            r'Local de Entrega[:\s]*(.*?)(?:\n\n|Linha|Item)',
            r'Entregar em[:\s]*(.*?)(?:\n\n|Linha|Item)'
        ]
        
        endereco_entrega = ""
        for pattern in endereco_patterns:
            endereco_match = re.search(pattern, full_text, re.IGNORECASE | re.DOTALL)
            if endereco_match:
                endereco_entrega = endereco_match.group(1).strip()
                endereco_entrega = ' '.join(endereco_entrega.split())
                break
        
        # Extrair região de entrega
        regiao = ""
        regiao_match = re.search(r'Regi[ãa]o[:\s]*(.*?)(?:\n|$)', full_text, re.IGNORECASE)
        if regiao_match:
            regiao = regiao_match.group(1).strip()
        
        # Extrair CNPJ do requisitante/cliente
        cnpj_requisitante = ""
        cnpj_patterns = [
            r'CNPJ[:\s]*(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})',
            r'(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})'
        ]
        
        for pattern in cnpj_patterns:
            cnpj_matches = re.findall(pattern, full_text)
            if cnpj_matches:
                for cnpj in cnpj_matches:
                    if cnpj != "46.663.556/0001-69":
                        cnpj_requisitante = cnpj
                        break
                break
        
        # Parser para PDFs FIEP
        items = []
        seen_items = set()
        lines = full_text.split('\n')
        
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            
            # Procurar código de 6 dígitos que começa com 0 ou 1
            if re.match(r'^([01]\d{5})$', line_stripped):
                codigo = line_stripped
                
                if i > 0:
                    prev = lines[i-1].strip()
                    if re.match(r'^\d{1,2}$', prev):
                        try:
                            linha_num = int(prev)
                            if 1 <= linha_num <= 100:
                                quantidade = 0
                                unidade = "UN"
                                descricao_parts = []
                                preco_pdf = None
                                
                                for j in range(i+1, min(i+40, len(lines))):
                                    check_line = lines[j].strip()
                                    
                                    if re.match(r'^([01]\d{5})$', check_line):
                                        break
                                    
                                    if len(check_line) > 2 and not re.match(r'^[\d.,]+$', check_line):
                                        if check_line not in ['UN', 'UND', 'UNID', 'KG', 'PC', 'M', 'L', 'CX', 'PAR', 'KIT']:
                                            if 'Descritivo Completo' not in check_line and 'CFOP' not in check_line:
                                                descricao_parts.append(check_line)
                                    
                                    qty_match = re.match(r'^(\d+)$', check_line)
                                    if qty_match and quantidade == 0:
                                        qty = int(qty_match.group(1))
                                        if j+1 < len(lines):
                                            unit_line = lines[j+1].strip().upper()
                                            valid_units = ['UN', 'UND', 'UNID', 'KG', 'PC', 'PÇA', 'PÇ', 'PCA', 'M', 'L', 'CX', 'PAR', 'PCT', 'KIT', 'JG', 'JOGO', 'RL', 'ROLO', 'MT', 'METRO']
                                            if unit_line in valid_units:
                                                quantidade = qty
                                                if unit_line in ['UND', 'UNID', 'PÇA', 'PÇ', 'PCA', 'PC']:
                                                    unidade = 'UN'
                                                elif unit_line in ['MT', 'METRO']:
                                                    unidade = 'M'
                                                elif unit_line in ['JOGO']:
                                                    unidade = 'JG'
                                                elif unit_line in ['ROLO']:
                                                    unidade = 'RL'
                                                else:
                                                    unidade = unit_line
                                                
                                                preco_pdf = None
                                                if j+2 < len(lines):
                                                    preco_line = lines[j+2].strip()
                                                    preco_match = re.match(r'^(\d{1,3}(?:\.\d{3})*,\d{2})$', preco_line)
                                                    if preco_match:
                                                        preco_str = preco_match.group(1).replace('.', '').replace(',', '.')
                                                        try:
                                                            preco_pdf = float(preco_str)
                                                        except:
                                                            pass
                                                
                                                break
                                
                                if quantidade > 0:
                                    key = f"{linha_num}-{codigo}"
                                    if key not in seen_items:
                                        seen_items.add(key)
                                        descricao = ' '.join(descricao_parts) if descricao_parts else f"Item {codigo}"
                                        item_data = {
                                            "codigo_item": codigo,
                                            "quantidade": quantidade,
                                            "descricao": descricao,
                                            "unidade": unidade,
                                            "endereco_entrega": endereco_entrega,
                                            "regiao": regiao
                                        }
                                        try:
                                            if preco_pdf is not None:
                                                item_data["preco_venda_pdf"] = preco_pdf
                                        except NameError:
                                            pass
                                        items.append(item_data)
                        except ValueError:
                            pass
        
        # Método 2 (fallback)
        if len(items) == 0:
            items = []
            seen_codes = set()
            
            for i, line in enumerate(lines):
                codigo_match = re.search(r'\b([01]\d{5})\b', line)
                if codigo_match:
                    codigo = codigo_match.group(1)
                    
                    if codigo in seen_codes:
                        continue
                    
                    quantidade = 0
                    unidade = "UN"
                    
                    qty_match = re.search(r'\b(\d+)\s*(UN|UND|UNID|KG|PC|M|L|CX|KIT)\b', line, re.IGNORECASE)
                    if qty_match:
                        quantidade = int(qty_match.group(1))
                        unidade = qty_match.group(2).upper()
                    else:
                        for j in range(i+1, min(i+8, len(lines))):
                            qty_match = re.search(r'\b(\d+)\s*(UN|UND|UNID|KG|PC|M|L|CX|KIT)\b', lines[j], re.IGNORECASE)
                            if qty_match:
                                quantidade = int(qty_match.group(1))
                                unidade = qty_match.group(2).upper()
                                break
                    
                    if quantidade > 0:
                        seen_codes.add(codigo)
                        items.append({
                            "codigo_item": codigo,
                            "quantidade": quantidade,
                            "descricao": f"Item {codigo}",
                            "unidade": unidade,
                            "endereco_entrega": endereco_entrega,
                            "regiao": regiao
                        })
        
        return {
            "numero_oc": numero_oc,
            "items": items,
            "endereco_entrega": endereco_entrega,
            "regiao": regiao,
            "cnpj_requisitante": cnpj_requisitante
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao processar PDF: {str(e)}")
