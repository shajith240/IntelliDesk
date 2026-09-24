// Semantic table primitives (header, body, row, cell) with optional sortable column headers.
import * as React from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type TableProps = React.ComponentProps<"table">;

function Table({ className, ...props }: TableProps) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

type TableHeaderProps = React.ComponentProps<"thead">;

function TableHeader({ className, ...props }: TableHeaderProps) {
  return (
    <thead
      className={cn(
        "[&_tr]:border-b-2 [&_tr:hover]:bg-transparent",
        className
      )}
      {...props}
    />
  );
}

type TableBodyProps = React.ComponentProps<"tbody">;

function TableBody(props: TableBodyProps) {
  return <tbody {...props} />;
}

type TableRowProps = React.ComponentProps<"tr">;

function TableRow({ className, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors duration-100 hover:bg-fill data-[selected=true]:bg-selected",
        className
      )}
      {...props}
    />
  );
}

type TableHeadProps = React.ComponentProps<"th"> & {
  sortDirection?: "asc" | "desc" | false;
  onSort?: () => void;
};

function TableHead({
  sortDirection,
  onSort,
  children,
  className,
  ...props
}: TableHeadProps) {
  let icon: React.ReactNode = null;

  if (onSort) {
    if (sortDirection === "asc") {
      icon = <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />;
    } else if (sortDirection === "desc") {
      icon = <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />;
    } else {
      icon = (
        <ArrowUpDown
          className="h-3.5 w-3.5 opacity-40"
          aria-hidden="true"
        />
      );
    }
  }

  return (
    <th
      scope="col"
      aria-sort={
        onSort
          ? sortDirection === "asc"
            ? "ascending"
            : sortDirection === "desc"
              ? "descending"
              : "none"
          : undefined
      }
      className={cn(
        "h-9 whitespace-nowrap px-2 text-left align-middle text-xs font-semibold text-subtle",
        className
      )}
      {...props}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-fill hover:text-foreground"
        >
          {children}
          {icon}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

type TableCellProps = React.ComponentProps<"td">;

function TableCell({ className, ...props }: TableCellProps) {
  return (
    <td
      className={cn("h-10 px-2 align-middle", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
};
