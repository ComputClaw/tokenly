import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { errorResponse, handleError, handleOptions, corsHeaders, parseJsonBody, isNonEmptyString } from './_helpers.js';
import { UsageRecord } from '../models/index.js';

interface IngestJsonBody {
  client_hostname?: string;
  records?: UsageRecord[];
}

async function handler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const services = await ensureInitialized();

    const contentType = request.headers.get('content-type') ?? '';

    let clientHostname: string | undefined;
    let records: UsageRecord[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      const metadataField = formData.get('metadata');
      let metadata: Record<string, unknown> = {};
      if (metadataField && typeof metadataField === 'string') {
        metadata = JSON.parse(metadataField);
      } else if (metadataField && typeof (metadataField as Blob).text === 'function') {
        metadata = JSON.parse(await (metadataField as Blob).text());
      }

      clientHostname = metadata.client_hostname as string;

      const fileField = formData.get('file');
      if (fileField && typeof (fileField as Blob).text === 'function') {
        const fileContent = await (fileField as Blob).text();
        const lines = fileContent.split('\n').filter(line => line.trim());

        const sizeBytes = new TextEncoder().encode(fileContent).length;
        const maxSizeMb = 50;
        if (sizeBytes > maxSizeMb * 1024 * 1024) {
          return errorResponse(413, 'file_too_large', 'File size exceeds maximum allowed limit', {
            max_size_mb: maxSizeMb,
            actual_size_mb: Math.round(sizeBytes / 1024 / 1024 * 100) / 100,
          });
        }

        for (const line of lines) {
          try {
            records.push(JSON.parse(line) as UsageRecord);
          } catch {
            records.push({ timestamp: '', service: '', model: '' });
          }
        }
      }
    } else if (contentType.includes('application/json')) {
      const body = await parseJsonBody<IngestJsonBody>(request);
      clientHostname = body?.client_hostname;
      records = body?.records ?? [];
    } else {
      return errorResponse(400, 'unsupported_content_type', 'Expected multipart/form-data or application/json');
    }

    if (!isNonEmptyString(clientHostname)) {
      return errorResponse(400, 'validation_failed', 'client_hostname is required');
    }

    if (records.length === 0) {
      return errorResponse(400, 'validation_failed', 'No records provided');
    }

    const result = await services.clientService.processIngest({
      clientHostname,
      records,
    });

    return new HttpResponse({
      status: result.status,
      jsonBody: result.body,
      headers: corsHeaders(),
    });
  } catch (err) {
    return handleError(err);
  }
}

app.http('ingest', {
  methods: ['POST', 'OPTIONS'],
  route: 'ingest',
  authLevel: 'anonymous',
  handler,
});
