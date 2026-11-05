'use client';

// Button — shadcn/ui's shape on top of our own tokens.
//
// Variants are spelled out with `cva` rather than conditional strings, so "which looks
// like what" is one table instead of N call sites.
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-rex-sm text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-rex-cyan text-white hover:bg-rex-blue/90',
        secondary: 'bg-rex-panel text-rex-text-body ring-1 ring-rex-border hover:bg-rex-panel-soft',
        outline: 'bg-transparent text-rex-text-body ring-1 ring-rex-border hover:bg-rex-panel',
        ghost: 'bg-transparent text-rex-text-muted hover:bg-rex-panel hover:text-rex-text',
        danger: 'bg-rex-danger text-white hover:bg-rex-danger/90',
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-7 px-2.5 text-xs',
        lg: 'h-10 px-5',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
