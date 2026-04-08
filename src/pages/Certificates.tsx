import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isXamppMode } from '@/lib/appConfig';
import { xamppApiRequest } from '@/lib/xamppApi';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Award, CheckCircle2, Loader2, Plus, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Certificate {
  id: string;
  trainee_id: string;
  program_id: string;
  assessment_id: string | null;
  attempt_id: string | null;
  issued_at: string;
  certificate_number: string;
  issued_by: string;
  notes: string | null;
}

interface Program {
  id: string;
  title: string;
  trainer_id: string;
}

interface Profile {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface Attempt {
  id: string;
  assessment_id: string;
  trainee_id: string;
  program_id?: string;
  score: number | null;
  passed: boolean | null;
  completed_at: string | null;
}

interface EligibleTrainee {
  program_id: string;
  user_id: string;
}

interface CertificatesResponse {
  data: Certificate[];
  programs: Program[];
  profiles: Profile[];
  attempts: Attempt[];
  eligible_trainees: EligibleTrainee[];
}

export default function Certificates() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const canManage = role === 'admin' || role === 'trainer';
  const printRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [eligibleTrainees, setEligibleTrainees] = useState<EligibleTrainee[]>([]);
  const [issuingOpen, setIssuingOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState('');
  const [selectedAttempt, setSelectedAttempt] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [viewCert, setViewCert] = useState<Certificate | null>(null);

  useEffect(() => {
    if (!role) {
      return;
    }

    void fetchData();
  }, [role, user?.id]);

  const fetchData = async () => {
    setLoading(true);

    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<CertificatesResponse>('/certificates');
        setPrograms(response.programs ?? []);
        setCertificates(response.data ?? []);
        setProfiles(response.profiles ?? []);
        setAttempts(response.attempts ?? []);
        setEligibleTrainees(response.eligible_trainees ?? []);
        return;
      }

      const [programsRes, certificatesRes] = await Promise.all([
        supabase.from('training_programs').select('id, title, trainer_id').order('title'),
        supabase.from('certificates').select('*').order('issued_at', { ascending: false }),
      ]);

      if (programsRes.error) {
        throw programsRes.error;
      }

      if (certificatesRes.error) {
        throw certificatesRes.error;
      }

      setPrograms((programsRes.data as Program[]) ?? []);
      setCertificates((certificatesRes.data as Certificate[]) ?? []);

      if (canManage) {
        const [profilesRes, attemptsRes] = await Promise.all([
          supabase.from('profiles').select('user_id, full_name, email'),
          supabase.from('assessment_attempts').select('*').eq('passed', true),
        ]);

        if (profilesRes.error) {
          throw profilesRes.error;
        }

        if (attemptsRes.error) {
          throw attemptsRes.error;
        }

        setProfiles((profilesRes.data as Profile[]) ?? []);
        setAttempts((attemptsRes.data as Attempt[]) ?? []);
      } else if (user) {
        const { data: profileRes, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (profileRes) {
          setProfiles([profileRes as Profile]);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load certificates';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const issueCertificate = async () => {
    if (!user || !selectedProgram || !selectedTrainee) {
      return;
    }

    setIssuing(true);

    try {
      if (isXamppMode) {
        await xamppApiRequest<{ certificate_number: string }>('/certificates', {
          method: 'POST',
          body: {
            program_id: selectedProgram,
            trainee_id: selectedTrainee,
            attempt_id: selectedAttempt || null,
          },
        });
      } else {
        const attempt = attempts.find((item) => item.id === selectedAttempt);
        const { error } = await supabase.from('certificates').insert({
          trainee_id: selectedTrainee,
          program_id: selectedProgram,
          assessment_id: attempt?.assessment_id || null,
          attempt_id: selectedAttempt || null,
          issued_by: user.id,
        });

        if (error) {
          throw error;
        }
      }

      toast({
        title: 'Certificate issued successfully!',
        description: 'The trainee can now view their certificate.',
      });
      setIssuingOpen(false);
      setSelectedProgram('');
      setSelectedTrainee('');
      setSelectedAttempt('');
      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to issue certificate';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIssuing(false);
    }
  };

  const getTraineeName = (userId: string) => {
    const profile = profiles.find((item) => item.user_id === userId);
    return profile?.full_name || profile?.email || 'Unknown';
  };

  const getProgramTitle = (programId: string) =>
    programs.find((program) => program.id === programId)?.title || 'Unknown';

  const eligibleTraineeIdsForProgram = selectedProgram
    ? eligibleTrainees.filter((item) => item.program_id === selectedProgram).map((item) => item.user_id)
    : [];

  const traineeOptions = canManage
    ? profiles.filter((profile) => {
        if (!selectedProgram || !isXamppMode) {
          return true;
        }

        return eligibleTraineeIdsForProgram.includes(profile.user_id);
      })
    : profiles;

  const traineeAttemptsForProgram = attempts.filter((attempt) => {
    if (!selectedTrainee) {
      return false;
    }

    if (attempt.trainee_id !== selectedTrainee) {
      return false;
    }

    if (!selectedProgram) {
      return true;
    }

    return !attempt.program_id || attempt.program_id === selectedProgram;
  });

  const handlePrint = () => {
    if (!printRef.current) {
      return;
    }

    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <html><head><title>Certificate</title>
      <style>
        body { margin: 0; font-family: Georgia, serif; background: #fff; }
        .cert { width: 800px; margin: 40px auto; padding: 60px; border: 12px double #b8860b; text-align: center; }
        .cert-mark { font-size: 36px; margin-bottom: 16px; font-weight: bold; color: #b8860b; }
        .cert-title { font-size: 36px; color: #b8860b; font-weight: bold; margin-bottom: 8px; }
        .cert-subtitle { font-size: 18px; color: #555; margin-bottom: 40px; }
        .cert-presented { font-size: 14px; color: #777; margin-bottom: 12px; }
        .cert-name { font-size: 32px; color: #1a1a1a; font-weight: bold; border-bottom: 2px solid #b8860b; display: inline-block; padding-bottom: 4px; margin-bottom: 24px; }
        .cert-program { font-size: 16px; color: #333; margin-bottom: 32px; }
        .cert-meta { font-size: 12px; color: #999; margin-top: 40px; }
      </style></head><body>${printContent}</body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Certificates</h1>
            <p className="text-muted-foreground">
              {canManage ? 'Issue and manage training certificates' : 'Your earned certificates'}
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setIssuingOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Issue Certificate
            </Button>
          )}
        </div>

        {certificates.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Award className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No certificates yet.</p>
              {role === 'trainee' && (
                <p className="mt-2 text-sm text-muted-foreground">Complete assessments to earn certificates.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {certificates.map((certificate) => (
              <Card key={certificate.id} className="relative overflow-hidden border-2">
                <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-yellow-400 via-yellow-600 to-yellow-400" />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <Award className="h-8 w-8 text-yellow-600" />
                    <Badge variant="outline" className="font-mono text-xs">{certificate.certificate_number}</Badge>
                  </div>
                  <CardTitle className="mt-2 text-base">{getProgramTitle(certificate.program_id)}</CardTitle>
                  {canManage && (
                    <CardDescription className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      {getTraineeName(certificate.trainee_id)}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Issued: {format(new Date(certificate.issued_at), 'MMMM d, yyyy')}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setViewCert(certificate)}>
                    <Printer className="mr-2 h-3 w-3" />View and Print
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={issuingOpen} onOpenChange={setIssuingOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue Certificate</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Training Program</Label>
                <Select value={selectedProgram} onValueChange={(value) => {
                  setSelectedProgram(value);
                  setSelectedTrainee('');
                  setSelectedAttempt('');
                }}>
                  <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                  <SelectContent>
                    {programs.map((program) => (
                      <SelectItem key={program.id} value={program.id}>{program.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Trainee</Label>
                <Select value={selectedTrainee} onValueChange={setSelectedTrainee} disabled={!selectedProgram}>
                  <SelectTrigger><SelectValue placeholder="Select trainee" /></SelectTrigger>
                  <SelectContent>
                    {traineeOptions.map((profile) => (
                      <SelectItem key={profile.user_id} value={profile.user_id}>
                        {profile.full_name || profile.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {traineeAttemptsForProgram.length > 0 && (
                <div>
                  <Label>Link to Assessment (optional)</Label>
                  <Select value={selectedAttempt} onValueChange={setSelectedAttempt}>
                    <SelectTrigger><SelectValue placeholder="Select passed attempt" /></SelectTrigger>
                    <SelectContent>
                      {traineeAttemptsForProgram.map((attempt) => (
                        <SelectItem key={attempt.id} value={attempt.id}>
                          Score: {attempt.score}% - {attempt.completed_at ? format(new Date(attempt.completed_at), 'MMM d, yyyy') : 'N/A'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => void issueCertificate()}
                  disabled={issuing || !selectedProgram || !selectedTrainee}
                  className="flex-1"
                >
                  {issuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Award className="mr-2 h-4 w-4" />}
                  Issue Certificate
                </Button>
                <Button variant="outline" onClick={() => setIssuingOpen(false)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewCert} onOpenChange={() => setViewCert(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Certificate Preview</DialogTitle>
            </DialogHeader>
            {viewCert && (
              <div>
                <div ref={printRef}>
                  <div
                    className="cert"
                    style={{
                      border: '10px double #b8860b',
                      padding: '48px',
                      textAlign: 'center',
                      background: 'linear-gradient(135deg, #fffdf0 0%, #fff 50%, #fffdf0 100%)',
                      borderRadius: '8px',
                    }}
                  >
                    <div className="cert-mark">M</div>
                    <h2
                      style={{
                        fontSize: '28px',
                        color: '#b8860b',
                        fontFamily: 'Georgia, serif',
                        marginBottom: '4px',
                      }}
                    >
                      Certificate of Completion
                    </h2>
                    <p style={{ color: '#777', fontSize: '14px', marginBottom: '32px' }}>
                      M&apos;archiTech Training Management System
                    </p>
                    <p style={{ color: '#555', fontSize: '14px', marginBottom: '12px' }}>
                      This is to certify that
                    </p>
                    <p
                      style={{
                        fontSize: '28px',
                        fontWeight: 'bold',
                        color: '#1a1a1a',
                        fontFamily: 'Georgia, serif',
                        borderBottom: '2px solid #b8860b',
                        display: 'inline-block',
                        paddingBottom: '4px',
                        marginBottom: '20px',
                      }}
                    >
                      {getTraineeName(viewCert.trainee_id)}
                    </p>
                    <p style={{ color: '#555', fontSize: '14px', marginBottom: '8px' }}>
                      has successfully completed the training program
                    </p>
                    <p
                      style={{
                        fontSize: '20px',
                        fontWeight: 'bold',
                        color: '#333',
                        marginBottom: '32px',
                        fontFamily: 'Georgia, serif',
                      }}
                    >
                      {getProgramTitle(viewCert.program_id)}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '40px',
                        paddingTop: '20px',
                        borderTop: '1px solid #ddd',
                      }}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid #333', width: '160px', marginBottom: '4px' }} />
                        <p style={{ fontSize: '11px', color: '#777' }}>Authorized Signature</p>
                      </div>
                      <div style={{ textAlign: 'center', fontSize: '11px', color: '#999' }}>
                        <p>Issued: {format(new Date(viewCert.issued_at), 'MMMM d, yyyy')}</p>
                        <p style={{ fontFamily: 'monospace' }}>{viewCert.certificate_number}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button onClick={handlePrint} className="flex-1">
                    <Printer className="mr-2 h-4 w-4" />Print Certificate
                  </Button>
                  <Button variant="outline" onClick={() => setViewCert(null)}>Close</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
