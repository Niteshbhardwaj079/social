import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import PlatformIcon from '../../components/common/PlatformIcon';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { getPosts } from '../../services/api/postsApi';
import { CALENDAR_VIEW, REQUEST_STATUS } from '../../config/constants';
import { getMonthGrid, getWeekDays, isSameDay, isSameMonth, WEEKDAY_LABELS } from '../../utils/calendarUtils';
import { formatDate, formatDateTime } from '../../utils/formatters';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/useI18n';

const VIEW_LABELS = {
  [CALENDAR_VIEW.MONTH]: 'Month',
  [CALENDAR_VIEW.WEEK]: 'Week',
  [CALENDAR_VIEW.AGENDA]: 'Agenda',
};

function Calendar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [posts, setPosts] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [view, setView] = useState(isMobile ? CALENDAR_VIEW.AGENDA : CALENDAR_VIEW.MONTH);
  const [referenceDate, setReferenceDate] = useState(new Date());

  function loadPosts() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getPosts()
      .then((data) => {
        setPosts(data.filter((post) => post.scheduledAt));
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadPosts();
  }, []);

  const postsByDate = useMemo(() => {
    return posts.reduce((map, post) => {
      const dateKey = new Date(post.scheduledAt).toDateString();
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey).push(post);
      return map;
    }, new Map());
  }, [posts]);

  function getPostsForDay(day) {
    return postsByDate.get(day.toDateString()) || [];
  }

  function shiftReferenceDate(amount) {
    setReferenceDate((current) => {
      const next = new Date(current);
      if (view === CALENDAR_VIEW.WEEK) {
        next.setDate(next.getDate() + amount * 7);
      } else {
        next.setMonth(next.getMonth() + amount);
      }
      return next;
    });
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.calendar')} subtitle="Loading your scheduled content..." />
        <div className="skeleton-card" />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.calendar')} />
        <ErrorState onRetry={loadPosts} />
      </>
    );
  }

  const monthWeeks = getMonthGrid(referenceDate.getFullYear(), referenceDate.getMonth());
  const weekDays = getWeekDays(referenceDate);
  const today = new Date();

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.calendar')}
        subtitle={t('pages.calendar')}
        guideChapterId="calendar"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate('/posts/create')}>
            <Icon name="PenSquare" size={16} />
            Create Post
          </button>
        }
      />

      <div className="calendar-toolbar">
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-icon-sm btn-outline-secondary-custom"
            onClick={() => shiftReferenceDate(-1)}
            aria-label="Previous"
            data-tooltip="Previous"
          >
            <Icon name="ChevronLeft" size={16} />
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => setReferenceDate(new Date())}>
            Today
          </button>
          <button
            type="button"
            className="btn btn-icon-sm btn-outline-secondary-custom"
            onClick={() => shiftReferenceDate(1)}
            aria-label="Next"
            data-tooltip="Next"
          >
            <Icon name="ChevronRight" size={16} />
          </button>
          <span className="fw-semibold ms-2">
            {referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div className="segmented-control">
          {Object.values(CALENDAR_VIEW).map((viewOption) => (
            <button
              key={viewOption}
              type="button"
              className={`segmented-control__item ${view === viewOption ? 'is-active' : ''}`.trim()}
              onClick={() => setView(viewOption)}
            >
              {VIEW_LABELS[viewOption]}
            </button>
          ))}
        </div>
      </div>

      {view === CALENDAR_VIEW.MONTH ? (
        <div className="calendar-month">
          <div className="calendar-month__weekdays">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="calendar-month__weekday">
                {label}
              </div>
            ))}
          </div>
          {monthWeeks.map((week, weekIndex) => (
            <div className="calendar-month__week" key={weekIndex}>
              {week.map((day) => {
                const dayPosts = getPostsForDay(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`calendar-month__day ${isSameMonth(day, referenceDate) ? '' : 'is-outside'} ${isSameDay(day, today) ? 'is-today' : ''}`.trim()}
                  >
                    <span className="calendar-month__day-number">{day.getDate()}</span>
                    <div className="calendar-month__day-posts">
                      {dayPosts.slice(0, 2).map((post) => (
                        <button key={post.id} type="button" className="calendar-month__post-chip" onClick={() => navigate(`/posts/${post.id}/edit`)}>
                          <PlatformIcon platformKey={post.platforms[0]} size={16} />
                          <span className="table-cell-truncate">{post.content}</span>
                        </button>
                      ))}
                      {dayPosts.length > 2 ? <span className="calendar-month__more">+{dayPosts.length - 2} more</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {view === CALENDAR_VIEW.WEEK ? (
        <div className="calendar-week">
          {weekDays.map((day) => {
            const dayPosts = getPostsForDay(day);
            return (
              <div key={day.toISOString()} className={`calendar-week__day ${isSameDay(day, today) ? 'is-today' : ''}`.trim()}>
                <div className="calendar-week__day-header">
                  <span>{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <span className="calendar-month__day-number">{day.getDate()}</span>
                </div>
                <div className="calendar-week__day-posts">
                  {dayPosts.length === 0 ? (
                    <span className="small text-muted-custom">No posts</span>
                  ) : (
                    dayPosts.map((post) => (
                      <button key={post.id} type="button" className="calendar-month__post-chip" onClick={() => navigate(`/posts/${post.id}/edit`)}>
                        <PlatformIcon platformKey={post.platforms[0]} size={16} />
                        <span className="table-cell-truncate">{post.content}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {view === CALENDAR_VIEW.AGENDA ? (
        <div className="panel-card">
          <div className="panel-card__body panel-card__body--flush">
            {posts.length === 0 ? (
              <EmptyState
                icon="CalendarDays"
                title="Nothing scheduled"
                description="Create a post and schedule it to see it here."
                actionLabel="Create Post"
                onAction={() => navigate('/posts/create')}
              />
            ) : (
              <div className="d-flex flex-column">
                {[...postsByDate.entries()]
                  .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB))
                  .map(([dateKey, dayPosts]) => (
                    <div key={dateKey} className="agenda-group">
                      <div className="agenda-group__date">{formatDate(dateKey)}</div>
                      {dayPosts.map((post) => (
                        <div key={post.id} className="agenda-group__post" onClick={() => navigate(`/posts/${post.id}/edit`)} role="button" tabIndex={0}>
                          <PlatformIcon platformKey={post.platforms[0]} size={28} />
                          <div className="flex-grow-1">
                            <div className="table-cell-truncate">{post.content}</div>
                            <div className="small text-muted-custom">{formatDateTime(post.scheduledAt)}</div>
                          </div>
                          <StatusBadge status={post.status} />
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Calendar;
