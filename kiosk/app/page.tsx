import { App } from '@/components/app/app';

export default function Page() {
  return <App tokenEndpoint="/api/token" agentName={process.env.AGENT_NAME || 'product-kiosk'} />;
}
