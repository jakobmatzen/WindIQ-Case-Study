CREATE TYPE "public"."measurement_status" AS ENUM('valid', 'missing', 'unparseable', 'sentinel', 'unknown_unit', 'out_of_range');--> statement-breakpoint
CREATE TABLE "masts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"measurement_height_m" double precision NOT NULL,
	"operator" text NOT NULL,
	"commissioned_at" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "masts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "measurements" (
	"mast_id" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"status" "measurement_status" NOT NULL,
	"wind_speed_ms" double precision,
	"raw_value" text,
	"unit" text NOT NULL,
	"wind_direction_deg" double precision,
	"version" integer NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurements_mast_id_hour_pk" PRIMARY KEY("mast_id","hour")
);
--> statement-breakpoint
ALTER TABLE "measurements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_mast_id_masts_id_fk" FOREIGN KEY ("mast_id") REFERENCES "public"."masts"("id") ON DELETE no action ON UPDATE no action;