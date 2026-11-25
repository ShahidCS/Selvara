/** The time-of-day greeting from the person's local clock (the shell renders only in the browser, so this is their own time zone).
 *  Midnight to 04:59 is "Hello": "Good Morning" at 2 a.m. reads wrong. Each word is capitalised: "Good Morning", "Good Afternoon", "Good Evening". */
export function greetingFor(hour: number): string {
  if (hour < 5) return "Hello";
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}
export const localGreeting = (d: Date = new Date()) => greetingFor(d.getHours());
