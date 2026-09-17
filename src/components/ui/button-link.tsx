import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent-red text-white hover:bg-accent-red-dark shadow-sm shadow-accent-red/20",
  secondary: "bg-gold text-brown hover:bg-gold-light",
  outline:
    "border-2 border-white text-white hover:bg-white hover:text-brown",
  ghost: "border-2 border-brown text-brown hover:bg-brown hover:text-white",
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
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold tracking-wide uppercase transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}
