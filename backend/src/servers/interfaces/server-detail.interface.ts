import { InstanceView } from './instance-view.interface';
import { ServerView } from './server-view.interface';

/** A server with its instances listed, rather than only counted. */
export interface ServerDetail extends ServerView {
  instances: InstanceView[];
}
