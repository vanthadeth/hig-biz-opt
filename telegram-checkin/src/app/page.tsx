import { Gate } from "@/components/Gate";

/**
 * One page, because there is one thing to do.
 *
 * Nothing is read here: the session does not exist until the launch has been
 * verified, so rendering anything server-side would only ever be the
 * signed-out version of it.
 */
export default function Page() {
  return <Gate />;
}
