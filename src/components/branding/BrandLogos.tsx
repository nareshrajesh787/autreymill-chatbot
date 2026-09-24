import Image from "next/image";

interface BrandLogoProps {
  className?: string;
  decorative?: boolean;
  priority?: boolean;
}

export function AutreyMillLogo({
  className,
  decorative = false,
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src="/branding/autrey-mill-logo.png"
      alt={decorative ? "" : "Autrey Mill Nature Preserve & Heritage Center"}
      width={959}
      height={300}
      className={className}
      priority={priority}
    />
  );
}

export function LearnAILogo({
  className,
  decorative = false,
}: Omit<BrandLogoProps, "priority">) {
  return (
    <Image
      src="/branding/learnai-logo.png"
      alt={decorative ? "" : "LearnAI"}
      width={1254}
      height={1254}
      className={className}
    />
  );
}
