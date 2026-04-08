import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Award, Bell, BookOpen, Calendar, CheckCheck, Info, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isXamppMode } from '@/lib/appConfig';
import { xamppApiRequest } from '@/lib/xamppApi';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

const typeIcons: Record<string, React.ElementType> = {
  enrollment: BookOpen,
  certificate: Award,
  session: Calendar,
  info: Info,
};

const typeColors: Record<string, string> = {
  enrollment: 'bg-primary/10 text-primary',
  certificate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  session: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  info: 'bg-muted text-muted-foreground',
};

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    void fetchNotifications();

    if (isXamppMode) {
      const intervalId = window.setInterval(() => {
        void fetchNotifications();
      }, 30000);

      return () => {
        window.clearInterval(intervalId);
      };
    }

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((previous) => [payload.new as Notification, ...previous]);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((previous) =>
            previous.map((notification) =>
              notification.id === (payload.new as Notification).id ? payload.new as Notification : notification,
            ),
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string } | null)?.id;
          if (!deletedId) return;
          setNotifications((previous) => previous.filter((notification) => notification.id !== deletedId));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchNotifications = async () => {
    if (isXamppMode) {
      const response = await xamppApiRequest<{ data: Notification[] }>('/notifications');
      setNotifications(response.data || []);
      return;
    }

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setNotifications(data as Notification[]);
    }
  };

  const markAsRead = async (id: string) => {
    if (isXamppMode) {
      await xamppApiRequest<{ message: string }>(`/notifications/${id}/read`, {
        method: 'PATCH',
      });
      setNotifications((previous) =>
        previous.map((notification) =>
          notification.id === id ? { ...notification, is_read: true } : notification,
        ),
      );
      return;
    }

    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((notification) => !notification.is_read).map((notification) => notification.id);
    if (unreadIds.length === 0) return;

    if (isXamppMode) {
      await xamppApiRequest<{ message: string }>('/notifications/read-all', {
        method: 'PATCH',
      });
      setNotifications((previous) =>
        previous.map((notification) => ({ ...notification, is_read: true })),
      );
      return;
    }

    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
  };

  const deleteNotification = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (isXamppMode) {
      await xamppApiRequest<{ message: string }>(`/notifications/${id}`, {
        method: 'DELETE',
      });
      setNotifications((previous) => previous.filter((notification) => notification.id !== id));
      return;
    }

    await supabase.from('notifications').delete().eq('id', id);
  };

  const handleClick = (notification: Notification) => {
    if (!notification.is_read) {
      void markAsRead(notification.id);
    }

    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen((current) => !current)}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[380px] rounded-lg border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center justify-between p-4 pb-2">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => void markAllRead()}>
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
          </div>
          <Separator />
          <ScrollArea className="max-h-[400px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Bell className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((notification) => {
                  const Icon = typeIcons[notification.type] || Info;
                  const colorClass = typeColors[notification.type] || typeColors.info;
                  return (
                    <div
                      key={notification.id}
                      className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 ${!notification.is_read ? 'bg-primary/5' : ''}`}
                      onClick={() => handleClick(notification)}
                    >
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-snug ${!notification.is_read ? 'font-semibold' : ''}`}>
                            {notification.title}
                          </p>
                          <div className="flex shrink-0 items-center gap-1">
                            {!notification.is_read && (
                              <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 hover:opacity-100"
                              onClick={(event) => void deleteNotification(notification.id, event)}
                            >
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground/70">
                          {formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
