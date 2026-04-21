export function daysToSeconds(days: number): number {
  return days * 86400;
}

export function secondsToDays(seconds: number): number {
  return seconds / 86400;
}

export function isMoreThanADay(seconds: number): boolean {
  return seconds > 86400;
}
