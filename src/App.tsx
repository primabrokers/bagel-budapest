import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './routes';
import { ToastHost } from './components/ui/ToastHost';
import { ConfirmHost } from './components/ui/ConfirmHost';
import { UpdateBanner } from './components/layout/UpdateBanner';
import { RouteErrorPage } from './components/layout/RouteErrorPage';

// A single pathless parent gives every route — the auth-gated shell AND the public /login and
// /rsvp/:token pages — one shared error boundary: a stale-chunk crash after a deploy self-heals
// with a reload, and anything else gets a branded recoverable page instead of react-router's
// raw default screen.
const router = createBrowserRouter([{ errorElement: <RouteErrorPage />, children: routes }]);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      {/* Above the router, not inside AppShell: a waiting update matters on /login too, not
          only once someone is signed in. */}
      <UpdateBanner />
      <ToastHost />
      <ConfirmHost />
    </>
  );
}
