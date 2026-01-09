// Função para remover acentos e converter para maiúsculas
export const normalizeText = (text) => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toUpperCase();
};

// Handler para inputs que devem ser normalizados
export const handleNormalizedInput = (e, setter, fieldName = null) => {
  const normalizedValue = normalizeText(e.target.value);
  if (fieldName) {
    setter(prev => ({ ...prev, [fieldName]: normalizedValue }));
  } else {
    setter(normalizedValue);
  }
};
