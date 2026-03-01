function minutesToHHMM(totalMinutes) {
  const sign = totalMinutes < 0 ? "-" : "";
  const m = Math.abs(totalMinutes);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${sign}${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

module.exports = { minutesToHHMM };
