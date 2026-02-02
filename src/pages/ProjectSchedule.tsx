import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar, CheckCircle2, Clock, Users, BookOpen, Award } from "lucide-react";

interface Phase {
  id: number;
  name: string;
  description: string;
  week: string;
  days: string;
  deliverables: string[];
  icon: React.ReactNode;
  color: string;
}

const phases: Phase[] = [
  {
    id: 1,
    name: "Foundation & Authentication",
    description: "Design system, landing page, and multi-role authentication",
    week: "Week 1",
    days: "Days 1-5",
    deliverables: [
      "Design system & UI components",
      "Landing page with navigation",
      "Login/Register pages",
      "Role-based authentication (Admin, Trainer, Trainee)",
      "Protected routes & dashboards layout"
    ],
    icon: <Users className="h-5 w-5" />,
    color: "bg-blue-500"
  },
  {
    id: 2,
    name: "User Management",
    description: "Admin tools for managing users and profiles",
    week: "Week 1-2",
    days: "Days 6-8",
    deliverables: [
      "User CRUD operations",
      "Profile management",
      "Role assignment interface",
      "User search & filtering",
      "Admin user dashboard"
    ],
    icon: <Users className="h-5 w-5" />,
    color: "bg-emerald-500"
  },
  {
    id: 3,
    name: "Training & Enrollment",
    description: "Training program management and registration",
    week: "Week 2",
    days: "Days 9-13",
    deliverables: [
      "Training program CRUD",
      "Course catalog display",
      "Enrollment workflow",
      "Payment tracking system",
      "Trainer assignment to courses"
    ],
    icon: <BookOpen className="h-5 w-5" />,
    color: "bg-violet-500"
  },
  {
    id: 4,
    name: "Attendance & Sessions",
    description: "Session scheduling and attendance tracking",
    week: "Week 3",
    days: "Days 14-17",
    deliverables: [
      "Session creation & scheduling",
      "Attendance marking system",
      "Attendance reports & calculations",
      "Calendar integration",
      "Session notifications"
    ],
    icon: <Calendar className="h-5 w-5" />,
    color: "bg-amber-500"
  },
  {
    id: 5,
    name: "Resources & Assessment",
    description: "Learning materials and evaluation system",
    week: "Week 3-4",
    days: "Days 18-22",
    deliverables: [
      "Resource upload & management",
      "Quiz/Assessment builder",
      "Grading system",
      "Progress tracking",
      "Feedback mechanism"
    ],
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: "bg-rose-500"
  },
  {
    id: 6,
    name: "Certification & Reports",
    description: "Certificate generation and analytics",
    week: "Week 4",
    days: "Days 23-26",
    deliverables: [
      "Certificate generation",
      "Admin analytics dashboard",
      "Training completion reports",
      "System testing & refinement",
      "Documentation & deployment"
    ],
    icon: <Award className="h-5 w-5" />,
    color: "bg-cyan-500"
  }
];

const weekDays = [
  { week: 1, days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { week: 2, days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { week: 3, days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { week: 4, days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] }
];

const ProjectSchedule = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 md:p-10">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <Badge className="mb-4 bg-blue-600/20 text-blue-400 border-blue-500/30 text-sm px-4 py-1">
            Project Timeline
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent mb-4">
            M'archiTech Training Management System
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            1-Month Implementation Schedule — From Foundation to Deployment
          </p>
        </div>

        {/* Timeline Overview */}
        <Card className="bg-slate-800/50 border-slate-700 mb-8">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-400" />
              Project Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-400">26</div>
                <div className="text-slate-400 text-sm">Working Days</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-emerald-400">6</div>
                <div className="text-slate-400 text-sm">Major Phases</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-violet-400">3</div>
                <div className="text-slate-400 text-sm">User Roles</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-amber-400">30</div>
                <div className="text-slate-400 text-sm">Deliverables</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Gantt Chart Style Timeline */}
        <Card className="bg-slate-800/50 border-slate-700 mb-8 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-white">Development Timeline (Gantt View)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Week Headers */}
              <div className="grid grid-cols-[200px_1fr] gap-4 mb-4">
                <div className="text-slate-400 font-medium">Phase</div>
                <div className="grid grid-cols-4 gap-2">
                  {weekDays.map((w) => (
                    <div key={w.week} className="text-center">
                      <div className="text-slate-300 font-medium mb-2">Week {w.week}</div>
                      <div className="grid grid-cols-5 gap-1">
                        {w.days.slice(0, 5).map((day, i) => (
                          <div key={i} className="text-xs text-slate-500">{day}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phase Bars */}
              {phases.map((phase) => (
                <div key={phase.id} className="grid grid-cols-[200px_1fr] gap-4 mb-3 items-center">
                  <div className="text-sm text-slate-300 truncate flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${phase.color}`}></div>
                    {phase.name}
                  </div>
                  <div className="grid grid-cols-[repeat(21,1fr)] gap-0.5">
                    {Array.from({ length: 21 }).map((_, dayIndex) => {
                      const dayNum = dayIndex + 1;
                      let isActive = false;
                      
                      if (phase.id === 1 && dayNum >= 1 && dayNum <= 5) isActive = true;
                      if (phase.id === 2 && dayNum >= 6 && dayNum <= 8) isActive = true;
                      if (phase.id === 3 && dayNum >= 9 && dayNum <= 13) isActive = true;
                      if (phase.id === 4 && dayNum >= 14 && dayNum <= 17) isActive = true;
                      if (phase.id === 5 && dayNum >= 18 && dayNum <= 22) isActive = true;
                      if (phase.id === 6 && dayNum >= 23 && dayNum <= 26) isActive = true;
                      
                      return (
                        <div
                          key={dayIndex}
                          className={`h-8 rounded-sm transition-all ${
                            isActive 
                              ? `${phase.color} opacity-80 hover:opacity-100` 
                              : 'bg-slate-700/30'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detailed Phase Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {phases.map((phase) => (
            <Card key={phase.id} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge className={`${phase.color} text-white border-0`}>
                    Phase {phase.id}
                  </Badge>
                  <span className="text-xs text-slate-400">{phase.days}</span>
                </div>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${phase.color}/20`}>
                    {phase.icon}
                  </div>
                  {phase.name}
                </CardTitle>
                <p className="text-slate-400 text-sm">{phase.description}</p>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-slate-500 mb-2 font-medium">DELIVERABLES</div>
                <ul className="space-y-2">
                  {phase.deliverables.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center text-slate-500 text-sm mt-12 pb-8">
          <p>M'archiTech Training Management System — Level 5 Diploma Project</p>
          <p className="mt-1">Prepared for Ruth Mbang'ombe</p>
        </div>
      </div>
    </div>
  );
};

export default ProjectSchedule;
