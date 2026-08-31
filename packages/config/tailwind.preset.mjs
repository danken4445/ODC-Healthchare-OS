/**
 * Shared semantic tokens for shadcn-compatible Tailwind configuration.
 * Apps can extend this preset as Tailwind is introduced without duplicating
 * their white-label theme contract.
 */
const preset = {
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--odyssey-radius)",
        md: "calc(var(--odyssey-radius) - 2px)",
        sm: "calc(var(--odyssey-radius) - 4px)",
      },
      colors: {
        background: "var(--odyssey-background)",
        foreground: "var(--odyssey-foreground)",
        primary: {
          DEFAULT: "var(--odyssey-primary)",
          foreground: "var(--odyssey-primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--odyssey-muted)",
          foreground: "var(--odyssey-muted-foreground)",
        },
        border: "var(--odyssey-border)",
      },
    },
  },
};

export default preset;
