/** Identifiers used by each service when reporting its own health. */
export type ServiceName = 'gateway' | 'auth-service' | 'task-service';

/**
 * Body returned by every service's `/health` endpoint.
 *
 * Compose healthchecks only inspect the status code, but the payload names
 * the service so a reviewer curling a port knows what answered.
 */
export interface HealthResponse {
  status: 'ok';
  service: ServiceName;
}
