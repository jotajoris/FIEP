import React, { memo } from 'react';

/**
 * Checkboxes de seleção para itens (NF, Frete, Status)
 */
const ItemSelectionCheckboxes = memo(({
  item,
  isSelectedForNF,
  isSelectedForFrete,
  isSelectedForStatus,
  isAdmin,
  onToggleNF,
  onToggleFrete,
  onToggleStatus
}) => {
  return (
    <div style={{ paddingTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Checkbox NF de Venda */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <input
          type="checkbox"
          checked={isSelectedForNF}
          onChange={(e) => {
            e.stopPropagation();
            onToggleNF();
          }}
          style={{ 
            width: '18px', 
            height: '18px', 
            cursor: 'pointer',
            accentColor: '#22c55e'
          }}
          title="Selecionar para NF de Venda"
        />
        <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: '600' }}>NF</span>
      </div>
      
      {/* Checkbox Frete */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input
            type="checkbox"
            checked={isSelectedForFrete}
            onChange={(e) => {
              e.stopPropagation();
              onToggleFrete();
            }}
            style={{ 
              width: '18px', 
              height: '18px', 
              cursor: 'pointer',
              accentColor: '#f59e0b'
            }}
            title="Selecionar para Frete de Envio"
          />
          <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: '600' }}>🚚</span>
        </div>
      )}
      
      {/* Checkbox Status */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input
            type="checkbox"
            checked={isSelectedForStatus}
            onChange={(e) => {
              e.stopPropagation();
              onToggleStatus();
            }}
            style={{ 
              width: '18px', 
              height: '18px', 
              cursor: 'pointer',
              accentColor: '#8b5cf6'
            }}
            title="Selecionar para Mudar Status"
          />
          <span style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: '600' }}>🔄</span>
        </div>
      )}
    </div>
  );
});

ItemSelectionCheckboxes.displayName = 'ItemSelectionCheckboxes';

export default ItemSelectionCheckboxes;
