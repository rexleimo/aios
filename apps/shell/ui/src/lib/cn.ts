// Class name composition, the one place `clsx` and `tailwind-merge` meet.
//
// shadcn/ui's components assume this helper exists; keeping the name and shape means a
// component copied from that ecosystem works here without a translation layer.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
