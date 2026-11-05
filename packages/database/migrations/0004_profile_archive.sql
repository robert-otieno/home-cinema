ALTER TABLE profiles ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
-- statement-breakpoint
CREATE INDEX profiles_user ON profiles(userId,archived);
-- statement-breakpoint
CREATE INDEX active_sessions ON playback_sessions(status,updatedAt);
-- statement-breakpoint
CREATE INDEX progress_profile ON progress(profileId,updatedAt);
