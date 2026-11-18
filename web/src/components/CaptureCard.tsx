import { STORE_LINKS, type NativeInfo } from '../lib/native';
import { Icon } from './Icon';

const BUILT_FOR: Record<NativeInfo['context'], string> = {
  production: 'Built from production',
  'deploy-preview': 'Built for this deploy preview',
  'branch-deploy': 'Built for this branch deploy',
};

function StoreLinks() {
  return (
    <div className="store-links">
      <a className="store-link" href={STORE_LINKS.ios} target="_blank" rel="noreferrer">
        <span className="store-link-small">Download on the</span>
        <span className="store-link-big">App Store</span>
      </a>
      <a className="store-link" href={STORE_LINKS.android} target="_blank" rel="noreferrer">
        <span className="store-link-small">Get it on</span>
        <span className="store-link-big">Google Play</span>
      </a>
    </div>
  );
}

function Qr({ info }: { info: NativeInfo }) {
  return (
    <a className="qr" href={info.deviceLink} aria-label="Open Field Notes on this device in NativeScript Preview">
      {/* The SVG comes from this deploy's own build plugin, not from user content. */}
      <span className="qr-code" dangerouslySetInnerHTML={{ __html: info.qrSvg }} />
      <span className="qr-badge" aria-hidden="true">
        <Icon name="phone" size={14} />
      </span>
    </a>
  );
}

/** "Capture on your phone": the QR this deploy's build plugin generated. */
export function CaptureCard({ info, variant = 'full' }: { info: NativeInfo; variant?: 'full' | 'rail' | 'popover' }) {
  return (
    <section className={`capture capture-${variant}`} aria-labelledby={`capture-title-${variant}`}>
      <Qr info={info} />
      <div className="capture-text">
        <p className="eyebrow eyebrow-native">
          <Icon name="phone" size={14} /> Capture on your phone
        </p>
        <h2 id={`capture-title-${variant}`} className="capture-title">
          Your phone is the field kit.
        </h2>
        <p className="capture-copy">
          Scan with your phone's camera to open Field Notes in <strong>NativeScript Preview</strong> (App Store / Google Play).
          {variant === 'full' && ' Photos, places, headings and the words in each picture land here the moment you save.'}
        </p>
        {variant === 'full' && (
          <a className="button button-primary button-block capture-open" href={info.deviceLink}>
            <Icon name="phone" size={16} /> Open on this phone
          </a>
        )}
        <StoreLinks />
        <p className="capture-deploy">
          <span className="capture-deploy-dot" />
          {BUILT_FOR[info.context] ?? 'Built for this deploy'}
          {info.commit && <code>{info.commit.slice(0, 7)}</code>}
        </p>
      </div>
    </section>
  );
}
