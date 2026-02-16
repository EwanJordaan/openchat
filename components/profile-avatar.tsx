import Image from "next/image";

import { getAvatarInitial } from "@/app/lib/current-user";

interface ProfileAvatarProps {
  name: string | null;
  email: string | null;
  hasAvatar: boolean;
  avatarUpdatedAt: string | null;
  sizeClassName?: string;
  textClassName?: string;
}

export function ProfileAvatar({
  name,
  email,
  hasAvatar,
  avatarUpdatedAt,
  sizeClassName,
  textClassName,
}: ProfileAvatarProps) {
  const initial = getAvatarInitial(name, email);
  const sizeClass = sizeClassName ?? "h-10 w-10";
  const fallbackTextClass = textClassName ?? "text-sm";

  if (hasAvatar) {
    const cacheBust = avatarUpdatedAt ? `?v=${encodeURIComponent(avatarUpdatedAt)}` : "";

    return (
      <Image
        src={`/api/v1/me/avatar${cacheBust}`}
        alt="Profile"
        width={160}
        height={160}
        unoptimized
        className={`${sizeClass} rounded-full border border-white/15 object-cover`}
      />
    );
  }

  return (
    <span
      aria-label="Default profile avatar"
      className={`${sizeClass} inline-flex items-center justify-center rounded-full border border-[var(--accent-primary)]/35 bg-[var(--accent-primary)]/18 font-semibold text-[var(--accent-primary-strong)] ${fallbackTextClass}`}
    >
      {initial}
    </span>
  );
}
