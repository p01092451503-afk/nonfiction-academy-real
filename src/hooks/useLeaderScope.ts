import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

/**
 * Returns the department scope for the current Learning Leader (teacher).
 * A leader can see ALL staff that belong to their branch (organization),
 * including any team/sub-department under that branch.
 *
 * scopeIds = [branchId, ...all child department ids of that branch]
 */
export const useLeaderScope = () => {
  const { user, profile } = useUser();
  const myDeptId = profile?.department_id ?? null;

  const query = useQuery({
    queryKey: ["leader-scope", myDeptId],
    enabled: !!user?.id && !!myDeptId,
    queryFn: async () => {
      // Resolve the leader's branch root (top-level department).
      const { data: myDept, error: e1 } = await supabase
        .from("departments")
        .select("id, name, name_en, code, parent_department_id")
        .eq("id", myDeptId!)
        .maybeSingle();
      if (e1) throw e1;
      if (!myDept) return { branchId: null, branch: null, scopeIds: [] as string[] };

      const branchId = myDept.parent_department_id ?? myDept.id;

      const { data: branch } = await supabase
        .from("departments")
        .select("id, name, name_en, code, parent_department_id")
        .eq("id", branchId)
        .maybeSingle();

      // Include the branch + all sub-departments (teams)
      const { data: children, error: e2 } = await supabase
        .from("departments")
        .select("id")
        .eq("parent_department_id", branchId);
      if (e2) throw e2;

      const scopeIds = [branchId, ...(children?.map((c) => c.id) ?? [])];
      return { branchId, branch, scopeIds };
    },
  });

  return {
    isLoading: query.isLoading,
    branchId: query.data?.branchId ?? null,
    branch: query.data?.branch ?? null,
    scopeIds: query.data?.scopeIds ?? [],
    hasDepartment: !!myDeptId,
  };
};
