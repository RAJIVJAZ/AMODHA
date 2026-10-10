// Shared by the server-rendered milk app and its client form controls.
export const weekdays = [
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
  { value: 0, short: "Sun" },
];

export const frequencies = [
  { value: "daily", label: "Every day" },
  { value: "alternate_days", label: "Alternate days" },
  { value: "mon_to_sat", label: "Mon – Sat" },
  { value: "custom", label: "Pick days" },
];
