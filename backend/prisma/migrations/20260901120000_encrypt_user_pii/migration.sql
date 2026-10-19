-- Rename bvn -> bvn_encrypted (guarded)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bvn')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bvn_encrypted') THEN
    ALTER TABLE "users" RENAME COLUMN "bvn" TO "bvn_encrypted";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'nin')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'nin_encrypted') THEN
    ALTER TABLE "users" RENAME COLUMN "nin" TO "nin_encrypted";
  END IF;
END $$;

-- Widen type to TEXT (guarded)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bvn_encrypted' AND data_type = 'character varying') THEN
    ALTER TABLE "users" ALTER COLUMN "bvn_encrypted" TYPE TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'nin_encrypted' AND data_type = 'character varying') THEN
    ALTER TABLE "users" ALTER COLUMN "nin_encrypted" TYPE TEXT;
  END IF;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "users_bvn_idx";
DROP INDEX IF EXISTS "users_bvn_encrypted_idx";

-- DropCheckConstraint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "check_bvn_length";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "check_nin_length";
