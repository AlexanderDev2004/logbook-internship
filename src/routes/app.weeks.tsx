import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileDown, Plus, Trash2 } from "lucide-react";
import { downloadWeeksPdf } from "@/lib/typst/pdf-client";
import { createWeek, deleteWeek, listWeeks } from "../server/weeks";

export const Route = createFileRoute("/app/weeks")({
  loader: () => listWeeks(),
  component: WeeksPage,
});

function WeeksPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await createWeek({ data: { label, startDate } });
      setOpen(false);
      setLabel("");
      setStartDate("");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Log book weeks</h1>
          <p className="text-sm text-muted-foreground">
            Each week becomes one page of your log book PDF.
          </p>
        </div>
        <div className="flex gap-2">
          {data.weeks.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                downloadWeeksPdf(data.weeks.map((w) => w.id)).catch((e) =>
                  alert(String(e.message ?? e)),
                )
              }
            >
              <FileDown /> Export all PDF
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus /> New week
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New log book week</DialogTitle>
                <DialogDescription>
                  Use a short label like <code>26_10_w3</code> and the Monday date.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="wlabel">Label</Label>
                  <Input
                    id="wlabel"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="26_10_w3"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wstart">Start date</Label>
                  <Input
                    id="wstart"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={create} disabled={busy || !label || !startDate}>
                  Create week
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weeks</CardTitle>
          <CardDescription>
            A week is fully signed when the student, field supervisor, and academic
            advisor have all signed it. Signed weeks are locked from editing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.weeks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No weeks yet — create your first one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Signatures</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.weeks.map((w) => {
                  const signedCount = ["student", "field_supervisor", "academic_advisor"]
                    .filter((r) => (w.signatures as Record<string, { status: string }>)?.[r]?.status === "signed")
                    .length;
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/app/weeks/$weekId"
                          params={{ weekId: w.id }}
                          className="hover:underline"
                        >
                          {w.label}
                        </Link>
                      </TableCell>
                      <TableCell>{w.startDate}</TableCell>
                      <TableCell>{w.entryCount}</TableCell>
                      <TableCell>
                        {signedCount === 3 ? (
                          <Badge variant="success">fully signed</Badge>
                        ) : (
                          <Badge variant="warning">{signedCount}/3 signed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Download PDF"
                            onClick={() =>
                              downloadWeeksPdf([w.id]).catch((e) =>
                                alert(String(e.message ?? e)),
                              )
                            }
                          >
                            <FileDown />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete week"
                            onClick={async () => {
                              if (!confirm(`Delete week ${w.label}?`)) return;
                              try {
                                await deleteWeek({ data: { id: w.id } });
                                await router.invalidate();
                              } catch (e) {
                                alert(String((e as Error).message));
                              }
                            }}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

