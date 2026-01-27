import React, { useState, useCallback } from 'react';
import { API_URL } from '../../utils/api';

/**
 * Componente para exibir thumbnail de imagem com popup para visualização completa
 * e funcionalidade de upload via drag-and-drop
 */
const ItemImage = ({
  codigoItem,
  imagemUrl,
  onUpload,
  onDelete,
  canEdit = false,
  size = 'normal'
}) => {
  const [showPopup, setShowPopup] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const isSmall = size === 'small';
  const thumbnailSize = isSmall ? '40px' : '60px';

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (canEdit) setIsDragging(true);
  }, [canEdit]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!canEdit || !onUpload) return;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        setIsUploading(true);
        try {
          await onUpload(file);
        } finally {
          setIsUploading(false);
        }
      } else {
        alert('Por favor, envie apenas arquivos de imagem.');
      }
    }
  }, [canEdit, onUpload]);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      setIsUploading(true);
      try {
        await onUpload(file);
      } finally {
        setIsUploading(false);
      }
    }
  }, [onUpload]);

  // Se não tem imagem e pode editar, mostrar área de upload
  if (!imagemUrl) {
    if (!canEdit) {
      return (
        <div style={{
          width: thumbnailSize,
          height: thumbnailSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f3f4f6',
          borderRadius: '8px',
          color: '#9ca3af',
          fontSize: isSmall ? '1rem' : '1.5rem'
        }}>
          📷
        </div>
      );
    }

    return (
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          width: thumbnailSize,
          height: thumbnailSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isDragging ? '#dbeafe' : '#f3f4f6',
          border: `2px dashed ${isDragging ? '#3b82f6' : '#d1d5db'}`,
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          color: isDragging ? '#3b82f6' : '#9ca3af',
          fontSize: isSmall ? '0.7rem' : '0.75rem',
          textAlign: 'center'
        }}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {isUploading ? '⏳' : '📷+'}
      </label>
    );
  }

  // Tem imagem - mostrar thumbnail
  return (
    <>
      <div
        onClick={() => setShowPopup(true)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          width: thumbnailSize,
          height: thumbnailSize,
          borderRadius: '8px',
          overflow: 'hidden',
          cursor: 'pointer',
          border: isDragging ? '2px solid #3b82f6' : '2px solid #e2e8f0',
          position: 'relative',
          flexShrink: 0
        }}
      >
        <img
          src={imagemUrl.startsWith('http') ? imagemUrl : `${API_URL}${imagemUrl}`}
          alt={`Item ${codigoItem}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.parentNode.innerHTML = '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#9ca3af">❌</span>';
          }}
        />
        {isUploading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255,255,255,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            ⏳
          </div>
        )}
      </div>

      {/* Popup de imagem ampliada */}
      {showPopup && (
        <div
          onClick={() => setShowPopup(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '2rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: 'white',
              borderRadius: '12px',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            <img
              src={imagemUrl.startsWith('http') ? imagemUrl : `${API_URL}${imagemUrl}`}
              alt={`Item ${codigoItem}`}
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                display: 'block'
              }}
            />
            <div style={{
              padding: '0.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #e2e8f0'
            }}>
              <span style={{ fontWeight: '600', color: '#374151' }}>
                📷 {codigoItem}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {canEdit && onDelete && (
                  <button
                    onClick={() => {
                      if (window.confirm('Deseja excluir esta imagem?')) {
                        onDelete();
                        setShowPopup(false);
                      }
                    }}
                    style={{
                      padding: '0.4rem 0.8rem',
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    🗑️ Excluir
                  </button>
                )}
                <button
                  onClick={() => setShowPopup(false)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  ✕ Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ItemImage;
