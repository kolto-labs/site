import { useNavigate } from 'react-router';
import { useHotkeys } from '../lib/hotkeys';
import NotFoundWindow from '../placements/notfound/NotFoundWindow';

export default function NotFound() {
  const navigate = useNavigate();
  const abort = () => navigate('/');
  const retry = () => window.location.reload();
  const ignore = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  useHotkeys({ a: abort, r: retry, i: ignore }, [navigate]);
  return (
    <div className="page">
      <section className="dos" aria-labelledby="nf-title">
        <p className="dos__prompt" aria-hidden="true">
          K:\KOLTO&gt; type UNKNOWN
        </p>
        <h1 id="nf-title" className="dos__title">
          File not found
        </h1>
        <p className="dos__msg">
          No page exists at this address. It moved, or the link has a typo.
        </p>
        <p className="dos__q" aria-hidden="true">
          Abort, Retry, Ignore?<span className="cursor">_</span>
        </p>
        <div className="btn-row dos__actions">
          <button type="button" className="btn btn--primary" onClick={abort} aria-keyshortcuts="A">
            <span aria-hidden="true">[A]</span> Abort: go home
          </button>
          <button type="button" className="btn" onClick={retry} aria-keyshortcuts="R">
            <span aria-hidden="true">[R]</span> Retry: reload
          </button>
          <button type="button" className="btn" onClick={ignore} aria-keyshortcuts="I">
            <span aria-hidden="true">[I]</span> Ignore: go back
          </button>
        </div>
      </section>
      <NotFoundWindow />
    </div>
  );
}
