import type { QueryResultRow } from "pg";

import type {
  AiUsageRepository,
  ConsumeDailyRequestAllowanceInput,
  ConsumeDailyRequestAllowanceResult,
} from "@/backend/ports/repositories";

import type { PgQueryable } from "@/backend/adapters/db/postgres/types";

interface ConsumeAllowanceRow extends QueryResultRow {
  allowed: boolean;
  request_count: number;
}

export class PostgresAiUsageRepository implements AiUsageRepository {
  constructor(private readonly db: PgQueryable) {}

  async consumeDailyRequestAllowance(
    input: ConsumeDailyRequestAllowanceInput,
  ): Promise<ConsumeDailyRequestAllowanceResult> {
    const result = await this.db.query<ConsumeAllowanceRow>(
      `
      WITH seeded AS (
        INSERT INTO ai_usage_daily (provider_id, usage_date, subject_type, subject_id, request_count)
        VALUES ($1, $2, $3, $4, 0)
        ON CONFLICT (provider_id, usage_date, subject_type, subject_id) DO NOTHING
      ),
      consumed AS (
        UPDATE ai_usage_daily
        SET request_count = request_count + 1,
            updated_at = NOW()
        WHERE provider_id = $1
          AND usage_date = $2
          AND subject_type = $3
          AND subject_id = $4
          AND request_count < $5
        RETURNING request_count
      ),
      current_usage AS (
        SELECT request_count
        FROM ai_usage_daily
        WHERE provider_id = $1
          AND usage_date = $2
          AND subject_type = $3
          AND subject_id = $4
      )
      SELECT
        EXISTS(SELECT 1 FROM consumed) AS allowed,
        COALESCE((SELECT request_count FROM current_usage), 0) AS request_count
      `,
      [
        input.providerId,
        input.usageDate,
        input.subjectType,
        input.subjectId,
        input.limit,
      ],
    );

    const row = result.rows[0];

    return {
      allowed: Boolean(row?.allowed),
      requestCount: Number(row?.request_count ?? 0),
    };
  }
}
