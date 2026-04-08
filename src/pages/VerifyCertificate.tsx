import { useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isXamppMode } from '@/lib/appConfig';
import { xamppApiRequest } from '@/lib/xamppApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Award, CheckCircle2, Loader2, Search, ShieldCheck, XCircle } from 'lucide-react';

interface VerifiedCert {
  certificate_number: string;
  issued_at: string;
  trainee_name: string;
  program_title: string;
}

interface VerificationResponse {
  data: VerifiedCert | null;
}

export default function VerifyCertificate() {
  const [certNumber, setCertNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifiedCert | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleVerify = async () => {
    if (!certNumber.trim()) {
      return;
    }

    setLoading(true);
    setResult(null);
    setNotFound(false);
    setSearched(true);

    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<VerificationResponse>(
          `/certificates/verify?certificate_number=${encodeURIComponent(certNumber.trim().toUpperCase())}`,
          { skipAuth: true }
        );

        if (!response.data) {
          setNotFound(true);
        } else {
          setResult(response.data);
        }
      } else {
        const { data, error } = await supabase
          .rpc('verify_certificate_public', {
            p_certificate_number: certNumber.trim().toUpperCase(),
          })
          .maybeSingle();

        if (error || !data) {
          setNotFound(true);
        } else {
          setResult(data);
        }
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold text-foreground">Certificate Verification</span>
          </div>
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />Back
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-12">
        <div className="mb-8 text-center">
          <Award className="mx-auto mb-4 h-14 w-14 text-accent" />
          <h1 className="mb-2 text-2xl font-bold text-foreground">Verify a Certificate</h1>
          <p className="text-muted-foreground">
            Enter a certificate number to verify its authenticity.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. CERT-8A2B3C4D"
                value={certNumber}
                onChange={(event) => setCertNumber(event.target.value.toUpperCase())}
                onKeyDown={(event) => event.key === 'Enter' && void handleVerify()}
                className="font-mono"
              />
              <Button onClick={() => void handleVerify()} disabled={loading || !certNumber.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {searched && !loading && (
          <div className="mt-6">
            {result ? (
              <Card className="border-2 border-green-500/30 bg-green-50/50 dark:bg-green-950/10">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <CardTitle className="text-green-700 dark:text-green-400">Certificate Verified</CardTitle>
                  </div>
                  <CardDescription>This certificate is authentic and valid.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border py-2">
                    <span className="text-sm text-muted-foreground">Certificate Number</span>
                    <Badge variant="outline" className="font-mono">{result.certificate_number}</Badge>
                  </div>
                  <div className="flex items-center justify-between border-b border-border py-2">
                    <span className="text-sm text-muted-foreground">Recipient</span>
                    <span className="text-sm font-medium text-foreground">{result.trainee_name}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border py-2">
                    <span className="text-sm text-muted-foreground">Program</span>
                    <span className="text-sm font-medium text-foreground">{result.program_title}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">Issued Date</span>
                    <span className="text-sm font-medium text-foreground">
                      {format(new Date(result.issued_at), 'MMMM d, yyyy')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ) : notFound ? (
              <Card className="border-2 border-destructive/30 bg-red-50/50 dark:bg-red-950/10">
                <CardContent className="py-8 text-center">
                  <XCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
                  <p className="font-semibold text-destructive">Certificate Not Found</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    No certificate exists with the number &quot;{certNumber}&quot;. Please check and try again.
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
