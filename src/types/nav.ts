export type PageId =
  | 'dashboard'
  | 'bids'
  | 'converter'
  | 'loadsql'
  | 'nbids'
  | 'crew-bids-summary'
  | 'about'
  | 'client'
  | 'model'
  | 'roadmap'
  | 'dutyswap'
  | 'dutyswap2'

export const BREADCRUMBS: Record<PageId, string> = {
  bids:               'BIDS TYPE ANALYSIS',
  converter:          'PDF → EXCEL CONVERTER',
  loadsql:            'LOAD SQL INTO DB',
  nbids:              'N-BIDS REFORMAT',
  'crew-bids-summary':'CREW BIDS SUMMARY',
  dashboard:          'DASHBOARD',
  about:              'ABOUT US',
  client:             'ABOUT CLIENT',
  model:              'ABOUT MODEL',
  roadmap:            'ABOUT ROADMAP',
  dutyswap:           'DUTY SWAP DEMO',
  dutyswap2:          'DUTY SWAP II',
}

export const NAV_LABELS: Record<PageId, string> = {
  bids:               'Bids Type Analysis',
  converter:          'PDF → Excel Converter',
  loadsql:            'Load SQL into DB',
  nbids:              'N-Bids Reformat',
  'crew-bids-summary':'Crew Bids Summary',
  dashboard:          'Dashboard',
  about:              'Us',
  client:             'Client',
  model:              'Model',
  roadmap:            'Roadmap',
  dutyswap:           'Duty Swap',
  dutyswap2:          'Duty Swap II',
}
