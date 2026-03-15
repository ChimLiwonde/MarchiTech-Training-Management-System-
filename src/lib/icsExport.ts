/**
 * Generate an ICS calendar file content for a session.
 */
export function generateICS({
  title,
  date,
  startTime,
  endTime,
  location,
  description,
}: {
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string | null; // HH:MM or HH:MM:SS
  endTime?: string | null;
  location?: string | null;
  description?: string | null;
}): string {
  const formatDate = (d: string, time?: string | null): string => {
    const clean = d.replace(/-/g, '');
    if (time) {
      const t = time.replace(/:/g, '').slice(0, 6).padEnd(6, '0');
      return `${clean}T${t}`;
    }
    return clean;
  };

  const dtStart = formatDate(date, startTime);
  const dtEnd = endTime
    ? formatDate(date, endTime)
    : startTime
      ? formatDate(date, addHour(startTime))
      : null;

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@marchitec`;
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MArchiTech//Training//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
  ];

  if (startTime) {
    lines.push(`DTSTART:${dtStart}`);
    if (dtEnd) lines.push(`DTEND:${dtEnd}`);
  } else {
    // All-day event
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(`DTEND;VALUE=DATE:${dtStart}`);
  }

  lines.push(`SUMMARY:${escapeICS(title)}`);
  if (location) lines.push(`LOCATION:${escapeICS(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const newH = (h + 1) % 24;
  return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function downloadICS(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
