import ErrorState from './ErrorState';

// Shown inside the app shell when one page crashes: the menu, header and every
// other page keep working, and moving to another page clears the error.
function PageCrash({ onRetry }) {
  return <ErrorState onRetry={onRetry} />;
}

export default PageCrash;
