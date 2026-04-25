export const DATA_ENTRY_SAMPLE_TYPES = [
  'Tissue',
  'Cell pellet',
  'RNA',
  'DNA',
  'Protein',
  'Protein lysate',
  'Serum',
  'Plasma',
  'PBMC',
  'Whole blood',
  'Supernatant',
  'Cell suspension',
  'cDNA library',
  'Other',
];

export const SECONDARY_SAMPLE_PRESETS = [
  'RNA',
  'DNA',
  'Protein lysate',
  'cDNA library',
  'Cell suspension',
];

export const SECONDARY_TYPE_SHORT = {
  RNA: 'RNA',
  DNA: 'DNA',
  'Protein lysate': 'Pr',
  Protein: 'Pr',
  'Protein extract': 'Pr',
  'cDNA library': 'cDNA',
  cDNA: 'cDNA',
  'Cell suspension': 'Cell',
  PBMC: 'PBMC',
  Nuclei: 'Nuc',
  'ATAC nuclei': 'Nuc',
  'Metabolite extract': 'Met',
  'Lipid extract': 'Lip',
};

export const SECONDARY_DEFAULT_PROCESSING = {
  RNA: ['+TRIzol', '+TRIzol LS', '+RNase-free water'],
  DNA: ['+Column kit', '+Phenol-chloroform', '+Magnetic bead purification'],
  'Protein lysate': ['+RIPA buffer (+protease inhibitors)', '+NP40 lysis', '+SDS lysis', '+loading buffer'],
  Protein: ['+RIPA buffer (+protease inhibitors)', '+NP40 lysis', '+SDS lysis', '+loading buffer'],
  'cDNA library': ['+Reverse transcription', '+RT kit', 'Other'],
  cDNA: ['+Reverse transcription', '+RT kit', 'Other'],
  'Cell suspension': ['+PBS wash', '+0.04% BSA in PBS', '+RPMI + 10% FBS'],
};