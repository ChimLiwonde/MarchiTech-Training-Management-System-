import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  BarChart3,
  Calendar,
  Activity,
  Target,
  Users,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
} from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  icon: React.ElementType;
  targetId: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Quick Stats Overview',
    description: 'Get an instant snapshot of key metrics — users, active trainings, today\'s sessions, and certificates issued.',
    icon: Users,
    targetId: 'tour-quick-stats',
  },
  {
    title: 'Charts & Analytics',
    description: 'Visualize enrollment trends and assessment pass rates with interactive charts.',
    icon: BarChart3,
    targetId: 'tour-charts',
  },
  {
    title: 'Upcoming Sessions',
    description: 'Stay on top of your schedule with a list of sessions coming up in the next two weeks.',
    icon: Calendar,
    targetId: 'tour-upcoming',
  },
  {
    title: 'Recent Activity',
    description: 'Track the latest enrollments, certifications, and assessment completions across the platform.',
    icon: Activity,
    targetId: 'tour-activity',
  },
  {
    title: 'Program Progress',
    description: 'Monitor completion percentages and certification status across all your training programs.',
    icon: Target,
    targetId: 'tour-progress',
  },
];

const TOUR_STORAGE_KEY = 'marchitec-tour-completed';

export default function WelcomeTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setActive(false);
  }, []);

  const scrollToTarget = useCallback((targetId: string) => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const goNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      const next = step + 1;
      setStep(next);
      scrollToTarget(TOUR_STEPS[next].targetId);
    } else {
      completeTour();
    }
  };

  const goBack = () => {
    if (step > 0) {
      const prev = step - 1;
      setStep(prev);
      scrollToTarget(TOUR_STEPS[prev].targetId);
    }
  };

  useEffect(() => {
    if (active) {
      scrollToTarget(TOUR_STEPS[0].targetId);
    }
  }, [active, scrollToTarget]);

  if (!active) return null;

  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 animate-in fade-in duration-300" />

      {/* Tour Card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <Card className="pointer-events-auto w-full max-w-md shadow-2xl border-2 border-accent/30 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
          <CardContent className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Step {step + 1} of {TOUR_STEPS.length}
                  </p>
                  <h3 className="text-lg font-bold text-foreground">{current.title}</h3>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={completeTour}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Description */}
            <p className="text-muted-foreground leading-relaxed">{current.description}</p>

            {/* Progress Dots */}
            <div className="flex items-center justify-center gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === step ? 'w-6 bg-accent' : i < step ? 'w-2 bg-primary/40' : 'w-2 bg-border'
                  }`}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={completeTour}
                className="text-muted-foreground hover:text-foreground"
              >
                Skip tour
              </Button>
              <div className="flex gap-2">
                {step > 0 && (
                  <Button variant="outline" size="sm" onClick={goBack}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                )}
                <Button size="sm" onClick={goNext} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  {isLast ? (
                    <>
                      <Sparkles className="h-4 w-4 mr-1" />
                      Get Started
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
