"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { PROVIDER_LABELS, type Profile } from "@/lib/profile";

/**
 * Sidebar profile chip: shows the signed-in user (avatar + name) with a
 * sign-out link; renders per-provider sign-in buttons when unauthenticated and
 * Easy Auth is configured; falls back to a local session label otherwise.
 */
export default function ProfileChip() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/me")
      .then((r) => r.json())
      .then((p: Profile) => live && setProfile(p))
      .catch(() => live && setProfile(null));
    return () => {
      live = false;
    };
  }, []);

  if (!profile) return null;

  if (profile.authenticated) {
    return (
      <div className="profile-chip">
        <Avatar
          name={profile.name}
          email={profile.email}
          picture={profile.picture}
        />
        <span className="profile-name" title={profile.email ?? undefined}>
          {profile.name || profile.email || "Signed in"}
        </span>
        <a className="profile-signout" href="/.auth/logout" title="Sign out">
          Sign out
        </a>
      </div>
    );
  }

  if (profile.providers.length > 0) {
    return (
      <div className="profile-signin">
        <span className="profile-signin-label">Sign in</span>
        <div className="profile-signin-buttons">
          {profile.providers.map((p) => (
            <a
              key={p}
              className="profile-signin-btn"
              href={`/.auth/login/${p}?post_login_redirect_uri=/`}
            >
              {PROVIDER_LABELS[p] ?? p}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-chip">
      <Avatar name={profile.name || "You"} />
      <span className="profile-name">{profile.name || "You"}</span>
      <span className="profile-local">Local session</span>
    </div>
  );
}
