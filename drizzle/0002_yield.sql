CREATE TYPE "public"."yield_quality" AS ENUM('ok', 'uncertain', 'not_meaningful');--> statement-breakpoint
CREATE TABLE "site_versions" (
	"site_id" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"mast_id" text NOT NULL,
	"shear_exponent" double precision NOT NULL,
	"loss_availability" double precision NOT NULL,
	"loss_electrical" double precision NOT NULL,
	"loss_wake" double precision NOT NULL,
	"uncertainty" double precision NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_versions_site_id_version_pk" PRIMARY KEY("site_id","version")
);
--> statement-breakpoint
ALTER TABLE "site_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "turbine_versions" (
	"turbine_id" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"rated_power_kw" double precision NOT NULL,
	"hub_height_m" double precision NOT NULL,
	"rotor_diameter_m" double precision NOT NULL,
	"cut_in_wind_speed_ms" double precision NOT NULL,
	"cut_out_wind_speed_ms" double precision NOT NULL,
	"power_curve" jsonb NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turbine_versions_turbine_id_version_pk" PRIMARY KEY("turbine_id","version")
);
--> statement-breakpoint
ALTER TABLE "turbine_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "yield_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mast_id" text NOT NULL,
	"measurement_height_m" double precision NOT NULL,
	"turbine_id" text NOT NULL,
	"turbine_version" integer NOT NULL,
	"site_id" text NOT NULL,
	"site_version" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"window_hours" integer NOT NULL,
	"valid_hours" integer NOT NULL,
	"rejected_hours" integer NOT NULL,
	"missing_hours" integer NOT NULL,
	"coverage_ratio" double precision NOT NULL,
	"quality" "yield_quality" NOT NULL,
	"hub_height_factor" double precision NOT NULL,
	"measured_energy_mwh" double precision NOT NULL,
	"gross_aep_mwh" double precision NOT NULL,
	"loss_factor" double precision NOT NULL,
	"net_aep_mwh" double precision NOT NULL,
	"p50_mwh" double precision NOT NULL,
	"p90_mwh" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "yield_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "yield_results" ADD CONSTRAINT "yield_results_mast_id_masts_id_fk" FOREIGN KEY ("mast_id") REFERENCES "public"."masts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_results" ADD CONSTRAINT "yield_results_turbine_version_fk" FOREIGN KEY ("turbine_id","turbine_version") REFERENCES "public"."turbine_versions"("turbine_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_results" ADD CONSTRAINT "yield_results_site_version_fk" FOREIGN KEY ("site_id","site_version") REFERENCES "public"."site_versions"("site_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "yield_results_mast_id_id_idx" ON "yield_results" USING btree ("mast_id","id");