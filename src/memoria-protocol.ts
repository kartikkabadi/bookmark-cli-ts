export const MEMORIA_INGEST_SCHEMA = 'memoria.ingest.v1' as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {[key: string]: JsonValue};
export type JsonObject = {[key: string]: JsonValue};

export interface MemoriaIngestEnvelopeV1 {
  schema: typeof MEMORIA_INGEST_SCHEMA;
  operation: 'upsert' | 'delete';
  source: {
    connector: string;
    provider: string;
    externalId: string;
    capturedAt: string;
    raw?: JsonValue;
  };
  item: {
    kind: 'post' | 'thread' | 'article' | 'repository' | 'document' | 'note' | 'conversation' | 'other';
    content: string;
    title?: string;
    url?: string;
    author?: {id?: string; handle?: string; name?: string};
    sourceCreatedAt?: string | null;
    observedAt?: string;
    language?: string;
    tags?: string[];
    links?: string[];
    metadata?: JsonObject;
    trust?: number;
  };
}
