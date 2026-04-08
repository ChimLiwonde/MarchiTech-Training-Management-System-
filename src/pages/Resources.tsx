import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isXamppMode } from '@/lib/appConfig';
import { xamppApiRequest } from '@/lib/xamppApi';
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
import { Download, FileText, Link as LinkIcon, Loader2, Plus, Trash2, Upload } from 'lucide-react';

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

interface ResourcesResponse {
  data: Resource[];
  programs: Program[];
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
    void fetchData();
  }, [role, user?.id]);

  const fetchData = async () => {
    setLoading(true);

    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<ResourcesResponse>('/resources');
        setPrograms(response.programs ?? []);
        setResources(response.data ?? []);
        return;
      }

      const [programsRes, resourcesRes] = await Promise.all([
        supabase.from('training_programs').select('id, title').order('title'),
        supabase.from('training_resources').select('*').order('created_at', { ascending: false }),
      ]);

      if (programsRes.error) {
        throw programsRes.error;
      }

      if (resourcesRes.error) {
        throw resourcesRes.error;
      }

      setPrograms(programsRes.data ?? []);
      setResources(resourcesRes.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load resources';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!user || !selectedProgram || !title.trim()) {
      return;
    }

    setUploading(true);

    try {
      if (isXamppMode) {
        const formData = new FormData();
        formData.append('program_id', selectedProgram);
        formData.append('title', title.trim());

        if (description.trim()) {
          formData.append('description', description.trim());
        }

        if (externalUrl.trim()) {
          formData.append('external_url', externalUrl.trim());
        }

        if (file) {
          formData.append('file', file);
        }

        await xamppApiRequest<{ id: string }>('/resources', {
          method: 'POST',
          body: formData,
        });
      } else {
        let fileUrl: string | null = null;
        let fileType: string | null = null;

        if (file) {
          const ext = file.name.split('.').pop();
          const filePath = `${selectedProgram}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from('training-materials')
            .upload(filePath, file);

          if (uploadError) {
            throw uploadError;
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
          throw error;
        }
      }

      toast({ title: 'Resource added' });
      resetForm();
      setDialogOpen(false);
      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to add resource';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (isXamppMode) {
        await xamppApiRequest<{ message: string }>(`/resources/${id}`, {
          method: 'DELETE',
        });
      } else {
        const { error } = await supabase.from('training_resources').delete().eq('id', id);
        if (error) {
          throw error;
        }
      }

      setResources((current) => current.filter((resource) => resource.id !== id));
      toast({ title: 'Resource deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete resource';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setExternalUrl('');
    setFile(null);
    setSelectedProgram('');
  };

  const filtered = filterProgram === 'all'
    ? resources
    : resources.filter((resource) => resource.program_id === filterProgram);

  const getProgramTitle = (programId: string) =>
    programs.find((program) => program.id === programId)?.title || 'Unknown';

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
                <Button><Plus className="mr-2 h-4 w-4" />Add Resource</Button>
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
                        {programs.map((program) => (
                          <SelectItem key={program.id} value={program.id}>{program.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Title</Label>
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Resource title" />
                  </div>
                  <div>
                    <Label>Description (optional)</Label>
                    <Textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Brief description"
                    />
                  </div>
                  <div>
                    <Label>Upload File (optional)</Label>
                    <Input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                  </div>
                  <div>
                    <Label>External URL (optional)</Label>
                    <Input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://..." />
                  </div>
                  <Button onClick={() => void handleUpload()} disabled={uploading || !selectedProgram || !title.trim()} className="w-full">
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
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
              {programs.map((program) => (
                <SelectItem key={program.id} value={program.id}>{program.title}</SelectItem>
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
            {filtered.map((resource) => (
              <Card key={resource.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {resource.file_url ? <FileText className="h-5 w-5 text-primary" /> : <LinkIcon className="h-5 w-5 text-accent" />}
                      <CardTitle className="text-base">{resource.title}</CardTitle>
                    </div>
                    {canManage && (
                      <Button variant="ghost" size="icon" onClick={() => void handleDelete(resource.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <CardDescription>{getProgramTitle(resource.program_id)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resource.description && <p className="text-sm text-muted-foreground">{resource.description}</p>}
                  <div className="flex gap-2">
                    {resource.file_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={resource.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="mr-1 h-3 w-3" />Download
                        </a>
                      </Button>
                    )}
                    {resource.external_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={resource.external_url} target="_blank" rel="noopener noreferrer">
                          <LinkIcon className="mr-1 h-3 w-3" />Open Link
                        </a>
                      </Button>
                    )}
                    {resource.file_type && <Badge variant="secondary">{resource.file_type.toUpperCase()}</Badge>}
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
