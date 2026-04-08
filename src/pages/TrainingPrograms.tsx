import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { buildAppUrl, isXamppMode, paymentsEnabled } from "@/lib/appConfig";
import { xamppApiRequest } from "@/lib/xamppApi";
import {
  BookOpen,
  Calendar,
  CheckCircle,
  Loader2,
  Plus,
  Search,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

interface TrainingProgram {
  id: string;
  title: string;
  description: string | null;
  trainer_id: string;
  start_date: string | null;
  end_date: string | null;
  max_trainees: number | null;
  fee_amount?: number | string | null;
  cost_amount?: number | string | null;
  currency?: string | null;
  status: string;
  created_at: string;
  trainer_name?: string | null;
}

interface Enrollment {
  id: string;
  program_id: string;
  trainee_id: string;
  status: string;
  enrolled_at: string;
  updated_at?: string;
}

interface Payment {
  id: string;
  program_id: string;
  trainee_id: string;
  amount: number;
  currency: string;
  status: string;
  provider_reference?: string | null;
}

interface EnrollmentWithProfile extends Enrollment {
  profile?: {
    full_name: string | null;
    email: string;
  };
}

interface XamppProgramResponse {
  data: TrainingProgram[];
}

interface XamppEnrollmentResponse {
  data: Enrollment[];
}

interface XamppProgramEnrollmentResponse {
  data: Array<Enrollment & { full_name: string | null; email: string | null }>;
}

interface XamppPaymentResponse {
  data: Payment[];
}

interface XamppPublicSettingsResponse {
  payments_enabled: boolean;
  payment_provider: string | null;
}

const formatCurrency = (amount: number | string | null | undefined, currency = "MWK") => {
  const value = Number(amount ?? 0);
  return `${currency} ${Number.isFinite(value) ? value.toLocaleString() : "0"}`;
};

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "An unexpected error occurred.";

function TrainingProgramsContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [enrollmentsDialogOpen, setEnrollmentsDialogOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<TrainingProgram | null>(null);
  const [programEnrollments, setProgramEnrollments] = useState<EnrollmentWithProfile[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxTrainees, setMaxTrainees] = useState("30");
  const [feeAmount, setFeeAmount] = useState("0");
  const [costAmount, setCostAmount] = useState("0");
  const [status, setStatus] = useState("draft");
  const [submitting, setSubmitting] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [xamppPaymentsEnabled, setXamppPaymentsEnabled] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(!isXamppMode);
  const processedReturnRef = useRef<string | null>(null);

  const paymentFlowEnabled = isXamppMode ? xamppPaymentsEnabled : paymentsEnabled;

  useEffect(() => {
    if (!isXamppMode) {
      setSettingsLoaded(true);
      return;
    }

    let active = true;

    const loadSettings = async () => {
      try {
        const response = await xamppApiRequest<XamppPublicSettingsResponse>("/settings/public", {
          skipAuth: true,
        });

        if (!active) {
          return;
        }

        setXamppPaymentsEnabled(!!response.payments_enabled);
      } catch {
        if (!active) {
          return;
        }

        setXamppPaymentsEnabled(false);
      } finally {
        if (active) {
          setSettingsLoaded(true);
        }
      }
    };

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isXamppMode && !settingsLoaded) {
      return;
    }

    void fetchPrograms();
    if (role === "trainee") {
      void fetchMyEnrollments();
    } else {
      setEnrollments([]);
      setPayments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user?.id, settingsLoaded, xamppPaymentsEnabled]);

  useEffect(() => {
    if (!isXamppMode || !paymentFlowEnabled || !user) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const txRef = params.get("tx_ref");
    if (!txRef || processedReturnRef.current === txRef) {
      return;
    }

    processedReturnRef.current = txRef;
    void verifyPayment({ txRef });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, user?.id, paymentFlowEnabled]);

  const fetchPrograms = async () => {
    setLoading(true);

    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<XamppProgramResponse>("/training-programs");
        setPrograms(response.data || []);
        return;
      }

      const { data, error } = await supabase
        .from("training_programs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const trainerIds = [...new Set((data || []).map((program) => program.trainer_id))];
      let trainerMap: Record<string, string | null> = {};
      if (trainerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", trainerIds);
        if (profiles) {
          trainerMap = Object.fromEntries(profiles.map((profile) => [profile.user_id, profile.full_name]));
        }
      }

      setPrograms((data || []).map((program) => ({
        ...program,
        trainer_name: trainerMap[program.trainer_id] || null,
      })));
    } catch (error) {
      toast({
        title: "Error fetching programs",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMyEnrollments = async () => {
    if (!user) {
      return;
    }

    try {
      if (isXamppMode) {
        if (paymentFlowEnabled) {
          const [enrollmentResponse, paymentResponse] = await Promise.all([
            xamppApiRequest<XamppEnrollmentResponse>("/enrollments/my"),
            xamppApiRequest<XamppPaymentResponse>("/payments/my"),
          ]);

          setEnrollments(enrollmentResponse.data || []);
          setPayments(paymentResponse.data || []);
          return;
        }

        const response = await xamppApiRequest<XamppEnrollmentResponse>("/enrollments/my");
        setEnrollments(response.data || []);
        setPayments([]);
        return;
      }

      if (!paymentFlowEnabled) {
        const { data: enrolls } = await supabase
          .from("enrollments")
          .select("*")
          .eq("trainee_id", user.id);

        setEnrollments(enrolls || []);
        setPayments([]);
        return;
      }

      const [{ data: enrolls }, { data: pays }] = await Promise.all([
        supabase
          .from("enrollments")
          .select("*")
          .eq("trainee_id", user.id),
        supabase
          .from("payments")
          .select("id, program_id, trainee_id, amount, currency, status")
          .eq("trainee_id", user.id),
      ]);
      setEnrollments(enrolls || []);
      setPayments(pays || []);
    } catch (error) {
      toast({
        title: "Error fetching enrollments",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setMaxTrainees("30");
    setFeeAmount("0");
    setCostAmount("0");
    setStatus("draft");
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      if (isXamppMode) {
        await xamppApiRequest<{ message: string; id: string }>("/training-programs", {
          method: "POST",
          body: {
            title: title.trim(),
            description: description.trim() || null,
            start_date: startDate || null,
            end_date: endDate || null,
            max_trainees: parseInt(maxTrainees, 10) || 30,
            fee_amount: Number(feeAmount) || 0,
            cost_amount: Number(costAmount) || 0,
            currency: "MWK",
            status,
          },
        });
      } else {
        const { error } = await supabase.from("training_programs").insert({
          title: title.trim(),
          description: description.trim() || null,
          trainer_id: user!.id,
          start_date: startDate || null,
          end_date: endDate || null,
          max_trainees: parseInt(maxTrainees, 10) || 30,
          fee_amount: Number(feeAmount) || 0,
          cost_amount: Number(costAmount) || 0,
          currency: "MWK",
          status,
        });

        if (error) {
          throw error;
        }
      }

      toast({ title: "Program created successfully" });
      setCreateOpen(false);
      resetForm();
      await fetchPrograms();
    } catch (error) {
      toast({
        title: "Error creating program",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnroll = async (programId: string) => {
    try {
      setEnrolling(true);

      const program = programs.find((item) => item.id === programId);
      if (!program) {
        return;
      }

      if (isXamppMode) {
        const amount = Number(program.fee_amount ?? 0);
        if (paymentFlowEnabled) {
          if (!amount || amount <= 0) {
            toast({
              title: "Fee not set",
              description: "This program has no fee amount configured. Ask the trainer to set fee_amount before paying.",
              variant: "destructive",
            });
            return;
          }

          const checkoutResponse = await xamppApiRequest<{ checkout_url: string; tx_ref: string }>("/payments/checkout", {
            method: "POST",
            body: {
              program_id: programId,
              return_url: buildAppUrl("/trainings"),
            },
          });

          toast({
            title: "Redirecting to PayChangu...",
            description: "Complete the checkout to verify and activate your enrollment.",
          });

          window.location.href = checkoutResponse.checkout_url;
          return;
        }

        await xamppApiRequest<{ message: string }>(`/training-programs/${programId}/enroll`, {
          method: "POST",
        });
        toast({
          title: "Enrollment submitted",
          description: "Your enrollment request has been sent for approval.",
        });
        await fetchMyEnrollments();
        return;
      }

      const amount = Number(program.fee_amount ?? 0);
      const currency = program.currency || "MWK";
      if (paymentFlowEnabled && (!amount || amount <= 0)) {
        toast({
          title: "Fee not set",
          description: "This program has no fee amount configured. Ask the trainer to set fee_amount before paying.",
          variant: "destructive",
        });
        return;
      }

      const { data: existingEnrollment } = await supabase
        .from("enrollments")
        .select("id,status")
        .eq("program_id", programId)
        .eq("trainee_id", user!.id)
        .maybeSingle();

      let enrollmentId: string;
      if (existingEnrollment) {
        if (existingEnrollment.status === "approved") {
          toast({
            title: "Already approved",
            description: "You are already enrolled and approved for this training.",
            variant: "destructive",
          });
          return;
        }
        enrollmentId = existingEnrollment.id;
        await supabase
          .from("enrollments")
          .update({ status: "pending" })
          .eq("id", enrollmentId);
      } else {
        const { error: enrollError, data: inserted } = await supabase
          .from("enrollments")
          .insert({
            program_id: programId,
            trainee_id: user!.id,
            status: "pending",
          })
          .select("id")
          .single();

        if (enrollError) {
          throw enrollError;
        }

        enrollmentId = inserted.id;
      }

      if (!paymentFlowEnabled) {
        toast({
          title: "Enrollment submitted",
          description: "Offline mode is active, so payment is skipped and your request has been sent for approval.",
        });
        await fetchMyEnrollments();
        return;
      }

      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id,status")
        .eq("program_id", programId)
        .eq("trainee_id", user!.id)
        .maybeSingle();

      if (existingPayment) {
        await supabase
          .from("payments")
          .update({
            status: "pending",
            amount,
            currency,
            enrollment_id: enrollmentId,
          })
          .eq("id", existingPayment.id);
      } else {
        await supabase.from("payments").insert({
          trainee_id: user!.id,
          program_id: programId,
          enrollment_id: enrollmentId,
          amount,
          currency,
          status: "pending",
        });
      }

      const { data: checkoutData, error: functionError } = await supabase.functions.invoke("paychangu-initiate", {
        body: {
          program_id: programId,
          trainee_id: user!.id,
          enrollment_id: enrollmentId,
          amount,
          currency,
          return_url: buildAppUrl("/trainings"),
        },
      });

      if (functionError || !checkoutData?.checkout_url) {
        toast({
          title: "Payment initiation failed",
          description: functionError?.message || "Could not create checkout session.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Redirecting to PayChangu...",
        description: "Complete the PayChangu test checkout to verify and activate your enrollment.",
      });

      window.location.href = checkoutData.checkout_url;
      void fetchMyEnrollments();
    } catch (error) {
      toast({
        title: "Error enrolling",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setEnrolling(false);
    }
  };

  const handleUpdateStatus = async (programId: string, newStatus: string) => {
    try {
      if (isXamppMode) {
        await xamppApiRequest<{ message: string }>(`/training-programs/${programId}/status`, {
          method: "PATCH",
          body: { status: newStatus },
        });
      } else {
        const { error } = await supabase
          .from("training_programs")
          .update({ status: newStatus })
          .eq("id", programId);

        if (error) {
          throw error;
        }
      }

      toast({ title: "Status updated" });
      await fetchPrograms();
    } catch (error) {
      toast({
        title: "Error updating status",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const viewEnrollments = async (program: TrainingProgram) => {
    setSelectedProgram(program);
    setEnrollmentsDialogOpen(true);

    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<XamppProgramEnrollmentResponse>(`/training-programs/${program.id}/enrollments`);
        setProgramEnrollments((response.data || []).map((enrollment) => ({
          id: enrollment.id,
          program_id: enrollment.program_id,
          trainee_id: enrollment.trainee_id,
          status: enrollment.status,
          enrolled_at: enrollment.enrolled_at,
          updated_at: enrollment.updated_at,
          profile: {
            full_name: enrollment.full_name,
            email: enrollment.email || "",
          },
        })));
        return;
      }

      const { data } = await supabase
        .from("enrollments")
        .select("*")
        .eq("program_id", program.id);

      if (data && data.length > 0) {
        const traineeIds = data.map((enrollment) => enrollment.trainee_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", traineeIds);

        const enriched = data.map((enrollment) => ({
          ...enrollment,
          profile: profiles?.find((profile) => profile.user_id === enrollment.trainee_id),
        }));
        setProgramEnrollments(enriched);
      } else {
        setProgramEnrollments([]);
      }
    } catch (error) {
      toast({
        title: "Error loading enrollments",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      setProgramEnrollments([]);
    }
  };

  const handleEnrollmentAction = async (enrollmentId: string, newStatus: string) => {
    try {
      if (isXamppMode) {
        await xamppApiRequest<{ message: string }>(`/enrollments/${enrollmentId}/status`, {
          method: "PATCH",
          body: { status: newStatus },
        });
      } else {
        if (newStatus === "approved" && paymentFlowEnabled) {
          const { data: paymentResponse, error: paymentError } = await supabase
            .from("payments")
            .select("id,status")
            .eq("enrollment_id", enrollmentId)
            .maybeSingle();

          if (paymentError) {
            throw paymentError;
          }

          if (!paymentResponse || paymentResponse.status !== "successful") {
            toast({
              title: "Payment required",
              description: "This enrollment can only be approved after successful payment verification.",
              variant: "destructive",
            });
            return;
          }
        }

        const { error } = await supabase
          .from("enrollments")
          .update({ status: newStatus })
          .eq("id", enrollmentId);

        if (error) {
          throw error;
        }
      }

      toast({ title: `Enrollment ${newStatus}` });
      if (selectedProgram) {
        await viewEnrollments(selectedProgram);
      }
    } catch (error) {
      toast({
        title: "Error updating enrollment",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const clearPaymentQueryParams = () => {
    const params = new URLSearchParams(location.search);
    params.delete("tx_ref");
    params.delete("transaction_id");
    params.delete("status");

    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
      },
      { replace: true },
    );
  };

  const verifyPayment = async ({ txRef, programId }: { txRef?: string; programId?: string }) => {
    if (!isXamppMode || !paymentFlowEnabled) {
      return;
    }

    setVerifyingPayment(true);

    try {
      const response = await xamppApiRequest<{
        message: string;
        status: string;
        payment?: Payment;
        enrollment_status?: string | null;
      }>("/payments/verify", {
        method: "POST",
        body: txRef ? { tx_ref: txRef } : { program_id: programId },
      });

      toast({
        title: response.status === "successful" ? "Payment confirmed" : response.status === "pending" ? "Payment pending" : "Payment not completed",
        description: response.message,
        variant: response.status === "successful" ? "default" : response.status === "pending" ? "default" : "destructive",
      });

      await fetchMyEnrollments();
    } catch (error) {
      toast({
        title: "Payment verification failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setVerifyingPayment(false);
      if (txRef) {
        clearPaymentQueryParams();
      }
    }
  };

  const getStatusBadgeVariant = (value: string) => {
    switch (value) {
      case "active":
      case "approved":
        return "default" as const;
      case "completed":
        return "secondary" as const;
      case "draft":
      case "pending":
        return "outline" as const;
      case "cancelled":
      case "rejected":
      case "withdrawn":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  };

  const filtered = programs.filter((program) =>
    program.title.toLowerCase().includes(search.toLowerCase())
      || (program.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const isApprovedEnrolled = (programId: string) =>
    enrollments.some((enrollment) => enrollment.program_id === programId && enrollment.status === "approved");

  const getEnrollmentStatus = (programId: string) =>
    enrollments.find((enrollment) => enrollment.program_id === programId)?.status || null;

  const getPaymentStatus = (programId: string) => {
    const payment = payments.find((item) => item.program_id === programId);
    return payment?.status || null;
  };

  const paymentStatusLabel = (value: string | null) => {
    switch (value) {
      case "pending":
        return "Pending Payment";
      case "successful":
        return "Paid";
      case "failed":
        return "Payment Failed";
      case "cancelled":
        return "Payment Cancelled";
      default:
        return "No Payment";
    }
  };

  const canCreateProgram = role === "admin" || role === "trainer";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {role === "trainee" ? "Browse Trainings" : role === "trainer" ? "My Trainings" : "Training Programs"}
          </h2>
          <p className="text-muted-foreground">
            {role === "trainee"
              ? "Discover and enroll in available training programs."
              : "Manage your training programs and enrollments."}
          </p>
        </div>
        {canCreateProgram && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Program
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Training Program</DialogTitle>
                <DialogDescription>Set up a new training program for trainees to enroll in.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Program title" />
                </div>
                <div>
                  <Label htmlFor="desc">Description</Label>
                  <Textarea id="desc" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this program covers..." rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start">Start Date</Label>
                    <Input id="start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="end">End Date</Label>
                    <Input id="end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="max">Max Trainees</Label>
                    <Input id="max" type="number" value={maxTrainees} onChange={(event) => setMaxTrainees(event.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="fee">Fee Amount (MWK)</Label>
                    <Input id="fee" type="number" value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} min="0" step="1" />
                    <p className="mt-1 text-xs text-muted-foreground">Amount each trainee pays to enroll.</p>
                  </div>
                  <div>
                    <Label htmlFor="cost">Cost Amount (MWK)</Label>
                    <Input id="cost" type="number" value={costAmount} onChange={(event) => setCostAmount(event.target.value)} min="0" step="1" />
                    <p className="mt-1 text-xs text-muted-foreground">Estimated training delivery cost for profit analytics.</p>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Program
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search programs..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No training programs found.</p>
            {canCreateProgram && <p className="mt-1 text-sm text-muted-foreground">Create your first program to get started.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((program) => (
            <Card key={program.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg leading-tight">{program.title}</CardTitle>
                  <Badge variant={getStatusBadgeVariant(program.status)} className="ml-2 shrink-0 capitalize">
                    {program.status}
                  </Badge>
                </div>
                {program.description && (
                  <CardDescription className="line-clamp-2">{program.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span>Trainer: {program.trainer_name || "Unknown"}</span>
                  </div>
                  {(program.start_date || program.end_date) && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {program.start_date && new Date(program.start_date).toLocaleDateString()}
                        {program.start_date && program.end_date && " - "}
                        {program.end_date && new Date(program.end_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Max {program.max_trainees} trainees</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Fee: {formatCurrency(program.fee_amount, program.currency || "MWK")}
                    </Badge>
                    {(role === "admin" || role === "trainer") && (
                      <Badge variant="outline" className="text-xs">
                        Cost: {formatCurrency(program.cost_amount, program.currency || "MWK")}
                      </Badge>
                    )}
                  </div>
                  {role === "trainee" && paymentFlowEnabled && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Payment: {paymentStatusLabel(getPaymentStatus(program.id))}
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {role === "trainee" && program.status === "active" && paymentFlowEnabled && !isApprovedEnrolled(program.id) && (() => {
                    const paymentStatus = getPaymentStatus(program.id);
                    const canRetry = paymentStatus === null || paymentStatus === "failed" || paymentStatus === "cancelled";
                    return canRetry;
                  })() && (
                    <Button size="sm" onClick={() => handleEnroll(program.id)} disabled={enrolling}>
                      <UserPlus className="mr-1 h-4 w-4" />
                      {enrolling ? "Processing..." : "Pay & Enroll"}
                    </Button>
                  )}
                  {role === "trainee" && program.status === "active" && paymentFlowEnabled && !isApprovedEnrolled(program.id) && getPaymentStatus(program.id) === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => void verifyPayment({ programId: program.id })} disabled={verifyingPayment}>
                      {verifyingPayment ? "Checking..." : "Check Payment"}
                    </Button>
                  )}
                  {role === "trainee" && program.status === "active" && !paymentFlowEnabled && !isApprovedEnrolled(program.id) && getEnrollmentStatus(program.id) !== "pending" && (
                    <Button size="sm" onClick={() => handleEnroll(program.id)} disabled={enrolling}>
                      <UserPlus className="mr-1 h-4 w-4" />
                      {enrolling ? "Submitting..." : "Request Enrollment"}
                    </Button>
                  )}
                  {role === "trainee" && isApprovedEnrolled(program.id) && (
                    <Badge variant="secondary">Approved</Badge>
                  )}
                  {role === "trainee" && !paymentFlowEnabled && getEnrollmentStatus(program.id) === "pending" && (
                    <Badge variant="outline">Pending Approval</Badge>
                  )}

                  {(role === "admin" || (role === "trainer" && program.trainer_id === user?.id)) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => viewEnrollments(program)}>
                        <Users className="mr-1 h-4 w-4" />
                        Enrollments
                      </Button>
                      {program.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(program.id, "active")}>
                          Activate
                        </Button>
                      )}
                      {program.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(program.id, "completed")}>
                          Complete
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={enrollmentsDialogOpen} onOpenChange={setEnrollmentsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enrollments - {selectedProgram?.title}</DialogTitle>
            <DialogDescription>Manage trainee enrollments for this program.</DialogDescription>
          </DialogHeader>
          {programEnrollments.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">No enrollments yet.</p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {programEnrollments.map((enrollment) => (
                <div key={enrollment.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{enrollment.profile?.full_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{enrollment.profile?.email}</p>
                    <Badge variant={getStatusBadgeVariant(enrollment.status)} className="mt-1 text-xs capitalize">
                      {enrollment.status}
                    </Badge>
                  </div>
                  {enrollment.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" className="text-primary" onClick={() => handleEnrollmentAction(enrollment.id, "approved")}>
                        <CheckCircle className="h-5 w-5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleEnrollmentAction(enrollment.id, "rejected")}>
                        <XCircle className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TrainingPrograms() {
  return (
    <DashboardLayout>
      <TrainingProgramsContent />
    </DashboardLayout>
  );
}



