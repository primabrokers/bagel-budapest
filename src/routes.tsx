import { Navigate, type RouteObject } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SignInPage } from './components/auth/SignInPage';
import { lazyPage, isStaleChunkError, tryRecoverFromStaleChunk } from './lib/lazyPage';

export { isStaleChunkError, tryRecoverFromStaleChunk };

const DashboardPage = lazyPage(() => import('./pages/DashboardPage'), 'DashboardPage');
const GuestsPage = lazyPage(() => import('./pages/GuestsPage'), 'GuestsPage');
const InvitationsPage = lazyPage(() => import('./pages/InvitationsPage'), 'InvitationsPage');
const RsvpTrackerPage = lazyPage(() => import('./pages/RsvpTrackerPage'), 'RsvpTrackerPage');
const SeatingPage = lazyPage(() => import('./pages/SeatingPage'), 'SeatingPage');
const VendorsPage = lazyPage(() => import('./pages/VendorsPage'), 'VendorsPage');
const BudgetPage = lazyPage(() => import('./pages/BudgetPage'), 'BudgetPage');
const MenuPage = lazyPage(() => import('./pages/MenuPage'), 'MenuPage');
const TasksPage = lazyPage(() => import('./pages/TasksPage'), 'TasksPage');
const IdeasPage = lazyPage(() => import('./pages/IdeasPage'), 'IdeasPage');
const DocumentsPage = lazyPage(() => import('./pages/DocumentsPage'), 'DocumentsPage');
const RunSheetPage = lazyPage(() => import('./pages/RunSheetPage'), 'RunSheetPage');
const ContactsPage = lazyPage(() => import('./pages/ContactsPage'), 'ContactsPage');
const NotesPage = lazyPage(() => import('./pages/NotesPage'), 'NotesPage');
const NotificationsPage = lazyPage(() => import('./pages/NotificationsPage'), 'NotificationsPage');
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage');
const RsvpPortalPage = lazyPage(() => import('./pages/RsvpPortalPage'), 'RsvpPortalPage');
const InvitationPrintPage = lazyPage(() => import('./pages/print/InvitationPrintPage'), 'InvitationPrintPage');
const SeatingPlanPrintPage = lazyPage(() => import('./pages/print/SeatingPlanPrintPage'), 'SeatingPlanPrintPage');
const CatererPrintPage = lazyPage(() => import('./pages/print/CatererPrintPage'), 'CatererPrintPage');
const PlaceCardsPrintPage = lazyPage(() => import('./pages/print/PlaceCardsPrintPage'), 'PlaceCardsPrintPage');
const TableCardsPrintPage = lazyPage(() => import('./pages/print/TableCardsPrintPage'), 'TableCardsPrintPage');
const CateringSummaryPrintPage = lazyPage(
  () => import('./pages/print/CateringSummaryPrintPage'),
  'CateringSummaryPrintPage',
);
const RunSheetPrintPage = lazyPage(() => import('./pages/print/RunSheetPrintPage'), 'RunSheetPrintPage');

/**
 * The whole route table, flat. `/login` and `/rsvp/:token` sit OUTSIDE the `AppShell` branch —
 * `/login` because AppShell demands a session to render at all, `/rsvp/:token` because it is
 * reachable by an anonymous guest with no account and no session to demand. Every other page
 * lives under the pathless-except-for-`/` `AppShell` route, which is the auth gate — including
 * every `print/*` route below, each an ordinary authenticated page (see `PrintPageLayout`) rather
 * than a second family of public routes.
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <SignInPage /> },
  { path: '/rsvp/:token', element: <RsvpPortalPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'guests', element: <GuestsPage /> },
      { path: 'invitations', element: <InvitationsPage /> },
      { path: 'rsvp-tracker', element: <RsvpTrackerPage /> },
      { path: 'seating', element: <SeatingPage /> },
      { path: 'vendors', element: <VendorsPage /> },
      { path: 'budget', element: <BudgetPage /> },
      { path: 'menu', element: <MenuPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'ideas', element: <IdeasPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'run-sheet', element: <RunSheetPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'notes', element: <NotesPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'print/invitation/:householdId', element: <InvitationPrintPage /> },
      { path: 'print/seating-plan/:planId', element: <SeatingPlanPrintPage /> },
      { path: 'print/caterer/:planId', element: <CatererPrintPage /> },
      { path: 'print/place-cards/:planId', element: <PlaceCardsPrintPage /> },
      { path: 'print/table-cards/:planId', element: <TableCardsPrintPage /> },
      { path: 'print/catering-summary/:functionId', element: <CateringSummaryPrintPage /> },
      { path: 'print/run-sheet', element: <RunSheetPrintPage /> },
      // An unmatched path inside the shell lands on the dashboard rather than a blank outlet.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
