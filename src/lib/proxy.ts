/** If the network requires an HTTP(S) proxy (common on corporate networks), route outbound fetch through it. */
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
let done = false;
export function useEnvProxy() {
  if (done) return; done = true;
  if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());
}
