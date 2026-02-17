import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, FileText, Link as LinkIcon, Download, Trash2, Upload } from 'lucide-react';

interface Resource {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  external_url: string | null;
  uploaded_by: string;
  created_at: string;
}

interface Program {
  id: string;
  title: string;
}

export default function Resources() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [resources, setResources] = useState<Resource[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [selectedProgram, setSelectedProgram] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filterProgram, setFilterProgram] = useState('all');

  const canManage = role === 'admin' || role === 'trainer';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [programsRes, resourcesRes] = await Promise.all([
      supabase.from('training_programs').select('id, title').order('title'),
      supabase.from('training_resources').select('*').order('created_at', { ascending: false }),
    ]);

    if (programsRes.data) setPrograms(programsRes.data);
    if (resourcesRes.data) setResources(resourcesRes.data);
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!user || !selectedProgram || !title.trim()) return;
    setUploading(true);

    let fileUrl: string | null = null;
    let fileType: string | null = null;

    if (file) {
      const ext = file.name.split('.').pop();
      const filePath = `${selectedProgram}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('training-materials')
        .upload(filePath, file);

      if (uploadError) {
        toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('training-materials').getPublicUrl(filePath);
      fileUrl = urlData.publicUrl;
      fileType = ext || null;
    }

    const { error } = await supabase.from('training_resources').insert({
      program_id: selectedProgram,
      title: title.trim(),
      description: description.trim() || null,
      file_url: fileUrl,
      file_type: fileType,
      external_url: externalUrl.trim() || null,
      uploaded_by: user.id,
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Resource added' });
      resetForm();
      setDialogOpen(false);
      fetchData();
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('training_resources').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setResources((prev) => prev.filter((r) => r.id !== id));
      toast({ title: 'Resource deleted' });
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setExternalUrl('');
    setFile(null);
    setSelectedProgram('');
  };

  const filtered = filterProgram === 'all' ? resources : resources.filter((r) => r.program_id === filterProgram);
  const getProgramTitle = (pid: string) => programs.find((p) => p.id === pid)?.title || 'Unknown';

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
            <h1 className="text-2xl font-bold text-foreground">Training Resources</h1>
            <p className="text-muted-foreground">
              {canManage ? 'Upload and manage training materials' : 'Access your training materials'}
            </p>
          </div>
          {canManage && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Resource</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Training Resource</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Program</Label>
                    <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                      <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                      <SelectContent>
                        {programs.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Title</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resource title" />
                  </div>
                  <div>
                    <Label>Description (optional)</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
                  </div>
                  <div>
                    <Label>Upload File (optional)</Label>
                    <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </div>
                  <div>
                    <Label>External URL (optional)</Label>
                    <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://..." />
                  </div>
                  <Button onClick={handleUpload} disabled={uploading || !selectedProgram || !title.trim()} className="w-full">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {uploading ? 'Uploading...' : 'Add Resource'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Label>Filter by Program:</Label>
          <Select value={filterProgram} onValueChange={setFilterProgram}>
            <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programs</SelectItem>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No resources found.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <Card key={r.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {r.file_url ? <FileText className="h-5 w-5 text-primary" /> : <LinkIcon className="h-5 w-5 text-accent" />}
                      <CardTitle className="text-base">{r.title}</CardTitle>
                    </div>
                    {canManage && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <CardDescription>{getProgramTitle(r.program_id)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                  <div className="flex gap-2">
                    {r.file_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={r.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3 w-3 mr-1" />Download
                        </a>
                      </Button>
                    )}
                    {r.external_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={r.external_url} target="_blank" rel="noopener noreferrer">
                          <LinkIcon className="h-3 w-3 mr-1" />Open Link
                        </a>
                      </Button>
                    )}
                    {r.file_type && <Badge variant="secondary">{r.file_type.toUpperCase()}</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
