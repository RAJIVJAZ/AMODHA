import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-white border-ink hover:bg-accent-dark",
  secondary: "bg-primary text-ink border-ink hover:bg-primary-light",
  outline: "bg-white text-ink border-white hover:bg-blush",
  ghost: "bg-blush text-ink border-ink hover:bg-blush-dark",
};

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant;
};

export function ButtonLink({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={`font-heading sticker-shadow inline-flex items-center justify-center gap-2 rounded-full border-[2.5px] px-6 py-3 text-sm font-semibold tracking-wide uppercase transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-y-0 active:shadow-[1px_1px_0_0_var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}
