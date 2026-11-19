CREATE TABLE "measurement_sync_state" (
	"mast_id" text PRIMARY KEY NOT NULL,
	"corrections_since" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "measurement_sync_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "corrections" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "measurement_sync_state" ADD CONSTRAINT "measurement_sync_state_mast_id_masts_id_fk" FOREIGN KEY ("mast_id") REFERENCES "public"."masts"("id") ON DELETE no action ON UPDATE no action;