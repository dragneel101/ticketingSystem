// Shared status configuration used across ticket-related components.

export const STATUS_LABELS = {
  unassigned:               'Unassigned',
  assigned:                 'Assigned',
  'in-progress':            'In Progress',
  'requesting-escalation':  'Escalation',
  'pending-client':         'Pending Client',
  'pending-vendor':         'Pending Vendor',
  scheduled:                'Scheduled',
  resolved:                 'Resolved',
  closed:                   'Closed',
  // Legacy values — retained so existing tickets display correctly
  open:                     'Open',
  pending:                  'Pending',
};

// Ordered list for pickers/dropdowns (legacy values excluded from new selections).
export const STATUS_OPTIONS = [
  { value: 'unassigned',             label: 'Unassigned' },
  { value: 'assigned',               label: 'Assigned' },
  { value: 'in-progress',            label: 'In Progress' },
  { value: 'requesting-escalation',  label: 'Escalation' },
  { value: 'pending-client',         label: 'Pending Client' },
  { value: 'pending-vendor',         label: 'Pending Vendor' },
  { value: 'scheduled',              label: 'Scheduled' },
  { value: 'resolved',               label: 'Resolved' },
  { value: 'closed',                 label: 'Closed' },
];

// Statuses considered "terminal" — ticket is done.
export const TERMINAL_STATUSES = ['resolved', 'closed'];
