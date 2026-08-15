'use client';

import { Group, Pagination, Paper, Select, Text } from '@mantine/core';
import { PAGE_SIZES, type PageMeta } from '@tally/contracts';

import { rangeLabel } from '@/lib/task-query';

const PAGE_SIZE_DATA = PAGE_SIZES.map((size) => ({
  value: String(size),
  label: `${String(size)} per page`,
}));

export interface TaskPagerProps {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/**
 * Range readout, page selector and page-size selector.
 *
 * The page-size options are `PAGE_SIZES` from the contract, not a local list:
 * the gateway rejects anything outside that set with a `400` rather than
 * clamping, so a control offering a fifth value would be an error the user
 * cannot explain.
 */
export function TaskPager({ meta, onPageChange, onPageSizeChange }: TaskPagerProps) {
  return (
    <Paper p={14} px="md" mt="md">
      <Group gap="md" justify="space-between">
        <Text fz={12.5} c="ink.7" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {rangeLabel(meta)}
        </Text>

        <Pagination
          total={Math.max(1, meta.totalPages)}
          value={meta.page}
          onChange={onPageChange}
          getControlProps={(control) =>
            control === 'previous' || control === 'next'
              ? { 'aria-label': control === 'previous' ? 'Previous page' : 'Next page' }
              : {}
          }
        />

        <Select
          w={148}
          aria-label="Tasks per page"
          data={PAGE_SIZE_DATA}
          value={String(meta.pageSize)}
          onChange={(value) => onPageSizeChange(Number(value ?? PAGE_SIZES[0]))}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>
    </Paper>
  );
}
