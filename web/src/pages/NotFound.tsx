import { Icon } from '../components/Icon';
import { Link } from '../lib/router';

export function NotFound({ title = 'Off the map', copy = 'There’s nothing at this address.' }: { title?: string; copy?: string }) {
  return (
    <div className="page-wrap">
      <div className="state-card state-card-page">
        <span className="state-icon">
          <Icon name="globe" size={24} />
        </span>
        <h1 className="state-title">{title}</h1>
        <p className="state-copy">{copy}</p>
        <Link to="/" className="button button-primary">
          <Icon name="timeline" size={16} /> Back to your notes
        </Link>
      </div>
    </div>
  );
}
