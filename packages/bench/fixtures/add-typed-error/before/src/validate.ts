export function validateAge(age: number): number {
  if (age < 0) {
    throw new Error("age must be non-negative");
  }
  return age;
}
