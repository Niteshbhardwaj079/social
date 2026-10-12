-- The mobile number a person gives at sign-up (shown to the platform owner, to reach a customer).
ALTER TABLE users ADD COLUMN phone text NOT NULL DEFAULT '';
