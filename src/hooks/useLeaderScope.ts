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
  const { user, profile, isLoading: userLoading } = useUser();
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

      // If the user's own dept IS the branch, reuse it; otherwise fetch branch.
      let branch = myDept;
      if (myDept.parent_department_id) {
        const { data: br } = await supabase
          .from("departments")
          .select("id, name, name_en, code, parent_department_id")
          .eq("id", branchId)
          .maybeSingle();
        if (br) branch = br;
      }

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

  // While the user/profile is still loading, or while the scope query is in
  // flight (when enabled), report loading so callers don't prematurely show
  // a "no department" empty state.
  const isLoading = userLoading || (!!myDeptId && query.isLoading);

  return {
    isLoading,
    branchId: query.data?.branchId ?? null,
    branch: query.data?.branch ?? null,
    scopeIds: query.data?.scopeIds ?? [],
    // Treat as having a department only after we've finished loading the user
    // profile — avoids a false negative on first render.
    hasDepartment: userLoading ? true : !!myDeptId,
  };
};
